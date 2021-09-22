// read .env file into proces.env
require("dotenv").config()

const envalid = require("envalid")

module.exports = envalid.cleanEnv(process.env, {
    apiKey: envalid.str({ default: "" }),
    apiSecret: envalid.str({ default: "" }),
    amount: envalid.num({ default: "0.001" }),
    initialSell: envalid.bool({ default: true }),
    intervalMs: envalid.num({ default: "5500" }),
    test: envalid.bool({ default: false }),
    differencelogger: envalid.bool({ default: true }),
    token: envalid.str({ default: "" }),
    botchat: envalid.str({ default: "" }),
})