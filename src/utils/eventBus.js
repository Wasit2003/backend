const EventEmitter = require('events');

// Create a singleton EventBus
class EventBus extends EventEmitter {
  constructor() {
    super();
    this.setMaxListeners(100); // Increase max listeners to handle multiple clients
  }
  
  // Helper method to emit transaction status updates
  emitTransactionUpdate(userId, data) {
    this.emit(`transaction_${userId}`, {
      eventType: 'STATUS_UPDATE',
      timestamp: Date.now(),
      ...data
    });
  }
}

// Export a singleton instance
module.exports = new EventBus(); 