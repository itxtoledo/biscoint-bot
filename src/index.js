import Biscoint from "biscoint-api-node";
import Bottleneck from "bottleneck";
import { handleMessage, handleError, percent } from "./utils";
//import config from "./config.js";
import { Telegraf, Markup } from 'telegraf';

//let { amount, initialSell, intervalMs, test, differencelogger } = config;

let {
  apiKey, apiSecret, amount, initialDeposit, initialDate, minProfitPercent, initialSell, intervalMs, test,
  differencelogger, token, botchat
} = require("./env")

const bc = new Biscoint({
  apiKey: apiKey,
  apiSecret: apiSecret,
});

// Telegram
const bot = new Telegraf(token)
let balances

// const keyboard = Markup.inlineKeyboard(
//   [
//     Markup.button.callback('\u{1F9FE} Balance', 'balance'),
//     Markup.button.callback('\u{1F9FE} Configs', 'configs'),
//     Markup.button.callback('\u{1F51B} Test Mode', 'test'),
//     Markup.button.url('₿', 'https://www.biscoint.io')
//   ], { columns: 2 })

const keyboard = Markup.keyboard([
  ['🧾 Balance', '🔍 BTC Price'], // Row1 with 2 buttons
  ['☸ Configs', '🔛 Test Mode'], // Row2 with 2 buttons
  ['📖 Help', '₿ Biscoint'] // Row3 with 2 buttons
])
  .oneTime()
  .resize()

bot.hears('📖 Help', async (ctx) => {
  ctx.replyWithMarkdown(
    `*Comandos disponíveis:* 
      ============  
  *🧾 Balance:* Extrato resumido do saldo na corretora.\n
  *🔍 BTC Price:* Último preço do Bitcoin na corretora.\n
  *☸ Configs:* Configurações do Bot.\n
  *🔛 Test Mode:* Ativar/Desativar modo simulação.\n
  *₿:* Acessar a corretora.\n
      ============
      `, keyboard)
}
);

bot.hears('₿ Biscoint', async (ctx) => {
  ctx.reply('Acesse a corretora https://biscoint.io', keyboard);
}
);

bot.hears('🧾 Balance', async (ctx) => {
  await checkBalances();
}
);

bot.hears('🔛 Test Mode', async (ctx) => {
  if (test === false) {
    test = true
    ctx.reply('\u{1F6D1} Modo teste ativado!', keyboard);
    checkBalances();
  } else {
    test = false
    ctx.replyWithMarkdown(`\u{1F911} Modo teste desativado!`, keyboard);
    checkBalances();
  }
}
);

bot.hears('☸ Configs', (ctx) => {
  ctx.replyWithMarkdown(`
⏱️ *Intervalo*: ${intervalMs}ms
ℹ️ *Modo teste*: ${test ? 'ativado' : 'desativado'}
ℹ️ *InitialSell*: ${initialSell ? 'ativado' : 'desativado'}
💵 *Valor em operação*: ${amount}
    `, keyboard)
}
);

bot.hears('🔍 BTC Price', async (ctx) => {
  let priceBTC = await bc.ticker();
  ctx.replyWithMarkdown(`*Biscoint:*
📊 *Último preço:* ${Number(priceBTC.last).toLocaleString('pt-br', { style: 'currency', currency: 'BRL' })}
📈 *Alta de hoje:* ${Number(priceBTC.high).toLocaleString('pt-br', { style: 'currency', currency: 'BRL' })}
📉 *Baixa de hoje:* ${Number(priceBTC.low).toLocaleString('pt-br', { style: 'currency', currency: 'BRL' })}
 ₿ *Volume:* ${Number(priceBTC.vol)} BTC
`, keyboard)
}
);

bot.hears('💵 Adjust Amount', async (ctx) => {
  await adjustAmount();
}
);

bot.hears(/^\/comprar (.+)$/, async ctx => {
  let valor = ctx.match[1];
  await buyBTC(valor);
  await adjustAmount();
}
)

// Telegram End

// Checks that the configured interval is within the allowed rate limit.
const checkInterval = async () => {
  const { endpoints } = await bc.meta();
  const { windowMs, maxRequests } = endpoints.offer.post.rateLimit;
  handleMessage(`Offer Rate limits: ${maxRequests} request per ${windowMs}ms.`);
  let minInterval = 2.0 * parseFloat(windowMs) / parseFloat(maxRequests) + 600;

  if (!intervalMs) {
    intervalMs = minInterval;
    handleMessage(`Setting interval to ${intervalMs}ms`);
  } else if (intervalMs < minInterval) {
    handleMessage(`Interval too small (${intervalMs}ms). Must be higher than ${minInterval}ms`, 'error', true);
  }
};

const limiter = new Bottleneck({
  reservoir: 30,
  reservoirRefreshAmount: 30,
  reservoirRefreshInterval: 60 * 1000,
  maxConcurrent: 1,
});

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
    if (differencelogger) {
      handleMessage(`📈 Variação de preço: ${profit.toFixed(3)}%`);
      handleMessage(`Test mode: ${test}`);
      handleMessage(`Intervalo: ${intervalMs}ms`);
    }
    if (profit >= minProfitPercent && !test) {
      handleMessage(`\u{1F911} Sucesso! Lucro: ${profit.toFixed(3)}%`);
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
            bot.telegram.sendMessage(botchat, `\u{1F911} Sucesso! Lucro: ${profit.toFixed(3)}%`, keyboard)
          } catch (error) {
            handleError("Error on buy, retrying", error);
            await forceConfirm("buy", sellOffer.efPrice);
          }
        } catch (error) {
          handleError("Error on sell", error);
          bot.telegram.sendMessage(botchat, `Error on sell: ${JSON.stringify(error)}`, keyboard)
          if (error.error === "Insufficient funds") {
            initialSell = !initialSell;
            handleMessage("Switched to first buy");
            await adjustAmount(); // adjust amount
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
            bot.telegram.sendMessage(botchat, `\u{1F911} Sucesso! Lucro: ${profit.toFixed(3)}%`, keyboard)
          } catch (error) {
            handleError("Error on sell, retrying", error);
            await forceConfirm("sell", buyOffer.efPrice);
          }
        } catch (error) {
          handleError("Error on buy", error);
          bot.telegram.sendMessage(botchat, `Error on buy: ${JSON.stringify(error)}`, keyboard)
          if (error.error === "Insufficient funds") {
            initialSell = !initialSell;
            handleMessage("Switched to first sell");
            await adjustAmount(); // adjust amount
          }
        }
      }
    }
  } catch (error) {
    handleError("Error on get offer", error);
  }
}

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
      await adjustAmount(); // adjust amount
    } else { //throw "Error on forceConfirm, price is much distant";
      bot.telegram.sendMessage(botchat, `
      Erro ao Confirmar Ordem, o preço está muito distante!`, keyboard)
      await adjustAmount(); // adjust amount
    }
  } catch (error) {
    handleError("Error on force confirm", error);
    bot.telegram.sendMessage(botchat, `Erro ao confirmar: ${JSON.stringify(error)}`, keyboard)
    await adjustAmount(); // adjust amount
  }
}

const checkBalances = async () => {
  try {
    balances = await bc.balance();
    const { BRL, BTC } = balances;
    let priceBTC = await bc.ticker();

    // Pegando a data
    let data = initialDate

    // Precisamos quebrar a string para retornar cada parte
    const dataSplit = data.split('/');

    const day = dataSplit[0]; // 30
    const month = dataSplit[1]; // 03
    const year = dataSplit[2]; // 2019

    // Agora podemos inicializar o objeto Date, lembrando que o mês começa em 0, então fazemos -1.
    data = new Date(year, month - 1, day);
    const now = new Date(); // Data de hoje
    const past = new Date(data); // Outra data no passado
    const diff = Math.abs(now.getTime() - past.getTime()); // Subtrai uma data pela outra
    const days = Math.ceil(diff / (1000 * 60 * 60 * 24)); // Divide o total pelo total de milisegundos correspondentes a 1 dia. (1000 milisegundos = 1 segundo).

    // Cálculo do lucro 
    let profitBRLBTC = Number(BRL) + ((Number(priceBTC.last * BTC)))
    let realizedProfit = percent(initialDeposit, profitBRLBTC)

    await bot.telegram.sendMessage(botchat,
      `\u{1F911} Balanço:
<b>Status</b>: ${!test ? `\u{1F51B} Robô operando.` : `\u{1F6D1} Modo simulação.`} 
<b>Data inicial</b>: ${initialDate}
<b>Dias ativado</b>: ${days}
<b>Depósito inicial</b>: R$ ${initialDeposit.toFixed(2)}
<b>Saldo BRL:</b> R$ ${BRL} 
<b>Saldo BTC:</b> ${BTC} (R$ ${(priceBTC.last * BTC).toFixed(2)})
<b>Operando com</b>: ${amount}
<b>Profit (BRL + BTC):</b> ${realizedProfit.toFixed(2)}% (R$ ${(profitBRLBTC - initialDeposit).toFixed(2)});
`, { parse_mode: "HTML" });
    await bot.telegram.sendMessage(botchat, "Extrato resumido. Para maiores detalhes, acesse a corretora Biscoint!", keyboard)

    handleMessage(`Balances:  BRL: ${BRL} - BTC: ${BTC} `);
  } catch (e) {
    bot.telegram.sendMessage(botchat, 'Máximo de 12 requisições por minuto. Tente novamente em alguns instantes!')
  }
};

async function buyBTC(valor) {
  return new Promise((resolve, reject) => {
    (async () => {
      try {
        if (valor >= 50) {
          let buyOffer = await bc.offer({
            amount: valor,
            isQuote: true,
            op: "buy"
          });
          try {
            await bc.confirmOffer({
              offerId: buyOffer.offerId,
            });
            bot.telegram.sendMessage(botchat, `Compra de ${valor} em BTC efetuada com sucesso!`);
            resolve(true)
          } catch (error) {
            if (error.error === "Insufficient funds") {
              bot.telegram.sendMessage(botchat, `Você não tem saldo suficiente em BRL!`, keyboard);
            } else {
              bot.telegram.sendMessage(botchat, `${error.error}. ${error.details}`);
            }
            reject(false)
          }
        }
        else {
          bot.telegram.sendMessage(botchat, "Valor de compra abaixo do limite mínimo de 50 reais", keyboard);
          reject(false)
        }
      } catch (error) {
        bot.telegram.sendMessage(botchat, `${error.error}. ${error.details}`, keyboard);
        reject(false)
      }
    })();
  }).catch(err => {
    console.error(err)
  })
}

const adjustAmount = async () => {
  try {
    balances = await bc.balance();
    let { last } = await bc.ticker();
    const { BRL, BTC } = balances;
    let amountBRL = ((BRL * 0.90) / last).toFixed(5)
    let amountBTC = (BTC * 0.90).toFixed(5)
    if (amountBTC >= 0.0001 && amountBTC > amountBRL) {
      amount = amountBTC;
      initialSell = true; // initial sell
      bot.telegram.sendMessage(botchat, `💵 *Valor em operação*: ${amount}`, keyboard)
    } else {
      initialSell = false // initial buy
      amount = amountBRL
      bot.telegram.sendMessage(botchat, `💵 *Valor em operação*: ${amount}`, keyboard)
    }
  } catch (error) {
    handleMessage(JSON.stringify(error));
    bot.telegram.sendMessage(botchat, JSON.stringify(error))
  }
}

async function start() {
  handleMessage('Starting trades');
  bot.telegram.sendMessage(botchat, '\u{1F911} Iniciando trades!', keyboard);
  await checkInterval();
  await adjustAmount();
  setInterval(() => {
    limiter.schedule(() => trade());
  }, intervalMs);
}

bot.launch()

start().catch(e => handleMessage(JSON.stringify(e), 'error'));