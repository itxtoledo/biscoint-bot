module.exports = {
    apps: [
      {
        name: "bitcoint-bot",
        script: "./src/index.js",
        node_args: "-r esm --experimental-modules",
        env: {
          BISCOINT_KEY: "",
          BISCOINT_SECRET: "",
          NODE_ENV: "development"
        },
        env_production: {
          BISCOINT_KEY: "",
          BISCOINT_SECRET: "",
          NODE_ENV: "production"
        }
      }
    ]
  };