module.exports = {
  mongodb: {
    uri: process.env.MONGODB_URI
  },
  server: {
    port: process.env.PORT || 3000
  },
  bsc: {
    endpoint: 'https://bsc-dataseed.binance.org/', // BSC Mainnet
    chainId: 56
  }
}; 