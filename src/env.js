// read .env file into proces.env
require("dotenv").config()

const envalid = require("envalid")
var pjson = require("../package.json")

module.exports = envalid.cleanEnv(process.env, {
    apiKey: envalid.str({ default: "" }),
    apiSecret: envalid.str({ default: "" }),
    amount: envalid.num({ default: "300.00" }),
    amountCurrency: envalid.str({ default: "BRL" }),
    initialBuy: envalid.bool({ default: true }),
    minProfitPercent: envalid.num({ default: "0.03" }),
    intervalSeconds: envalid.bool({ default: false }),
    simulation: envalid.bool({ default: false }),
    executeMissedSecondLeg: envalid.bool({ default: true }),
    token: envalid.str({ default: "" }),
    botchat: envalid.str({ default: "" }),
    dataInicial: envalid.str({ default: "01/03/2021" }),
    valorInicial: envalid.num({ default: "300.00" }),
    multibot: envalid.bool({ default: true }),
    botId: envalid.str({ default: "bot_1" }),
    host1: envalid.str({ default: "localhost" }),
    port: envalid.num({
        default: 80,
        desc: "The port to start the server on",
    }),
    play: envalid.bool({ default: true }),
    VERSION: envalid.str({ default: pjson.version }),
})