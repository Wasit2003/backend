module.exports = {
  mongodb: {
    uri: process.env.MONGODB_URI || 'mongodb://localhost:27017/wallet_dev'
  },
  server: {
    port: process.env.PORT || 3000
  },
  bsc: {
    endpoint: 'https://data-seed-prebsc-1-s1.binance.org:8545/', // BSC Testnet
    chainId: 97
  }
}; 