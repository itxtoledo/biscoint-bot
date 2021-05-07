import Biscoint from "biscoint-api-node";
import Bottleneck from "bottleneck";
import { handleMessage, handleError, percent } from "./utils";
import config from "./config.js";

let { amount, initialSell, intervalMs, test, differencelogger } = config;

const bc = new Biscoint({
  apiKey: config.key,
  apiSecret: config.secret,
});

const limiter = new Bottleneck({
  reservoir: 30,
  reservoirRefreshAmount: 30,
  reservoirRefreshInterval: 60 * 1000,
  maxConcurrent: 1,
});

handleMessage("Successfully started");

let tradeCycleCount = 0;

async function trade() {
  try {
    const sellOffer = await bc.offer({
      amount,
      isQuote: false,
      op: "sell",
    });

    const buyOffer = await bc.offer({
      amount,
      isQuote: false,
      op: "buy",
    });

    const profit = percent(buyOffer.efPrice, sellOffer.efPrice);
    if (differencelogger)
      handleMessage(`Difference now: ${profit.toFixed(3)}%`);
    if (buyOffer.efPrice < sellOffer.efPrice && !test) {
      handleMessage(`Profit found: ${profit.toFixed(3)}%`);
      if (initialSell) {
        /* initial sell */
        try {
          await bc.confirmOffer({ offerId: sellOffer.offerId });
          handleMessage("Success on sell");
          try {
            await bc.confirmOffer({
              offerId: buyOffer.offerId,
            });
            handleMessage("Success on buy");
            tradeCycleCount += 1;
            handleMessage(
              `Success, profit: + ${profit.toFixed(
                3
              )}%, cycles: ${tradeCycleCount}`
            );
          } catch (error) {
            handleError("Error on buy, retrying", error);
            await forceConfirm("buy", sellOffer.efPrice);
          }
        } catch (error) {
          handleError("Error on sell", error);
          if (error.error === "Insufficient funds") {
            initialSell = !initialSell;
            handleMessage("Switched to first buy");
          }
        }
      } else {
        /* initial buy */
        try {
          await bc.confirmOffer({ offerId: buyOffer.offerId });
          handleMessage("Success on buy");
          try {
            await bc.confirmOffer({ offerId: sellOffer.offerId });
            handleMessage("Success on sell");
            tradeCycleCount += 1;
            handleMessage(
              `Success, profit: + ${profit.toFixed(
                3
              )}%, cycles: ${tradeCycleCount}`
            );
          } catch (error) {
            handleError("Error on sell, retrying", error);
            await forceConfirm("sell", buyOffer.efPrice);
          }
        } catch (error) {
          handleError("Error on buy", error);
          if (error.error === "Insufficient funds") {
            initialSell = !initialSell;
            handleMessage("Switched to first sell");
          }
        }
      }
    }
  } catch (error) {
    handleError("Error on get offer", error);
  }
}

setInterval(() => {
  limiter.schedule(() => trade());
}, intervalMs);

async function forceConfirm(side, oldPrice) {
  try {
    const offer = await bc.offer({
      amount,
      isQuote: false,
      op: side,
    });

    // if side is buy then compare with sell price
    if (
      (side === "buy" && oldPrice * 1.1 >= Number(offer.efPrice)) ||
      (side === "sell" && oldPrice * 0.9 <= Number(offer.efPrice))
    ) {
      await bc.confirmOffer({ offerId: offer.offerId });
      handleMessage("Success on retry");
    } else throw "Error on forceConfirm, price is much distant";
  } catch (error) {
    handleError("Error on force confirm", error);
  }
}
