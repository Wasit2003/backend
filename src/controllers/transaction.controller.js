const { Transaction } = require('../models/transaction.model');
const { User } = require('../models/user.model');

exports.createTransaction = async (req, res) => {
  try {
    const userId = req.user._id; // Get authenticated user's ID from token
    const user = await User.findById(userId);
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Create transaction with both IDs
    const transaction = new Transaction({
      userId: userId,
      clientUuid: req.body.clientUuid, // Client's UUID
      mainAccountName: user.username || user.name || user.phoneNumber,
      type: req.body.type,
      amount: req.body.amount,
      fromAddress: req.body.fromAddress,
      toAddress: req.body.toAddress,
      customerDetails: {
        name: req.body.customerName,
        phone: req.body.customerPhone,
        location: req.body.customerLocation
      },
      metadata: req.body.metadata || {}
    });

    await transaction.save();
    
    // Return both IDs in response
    res.status(201).json({
      transaction: {
        ...transaction.toObject(),
        mongoId: transaction._id,
        clientUuid: transaction.clientUuid
      }
    });
  } catch (error) {
    console.error('Error creating transaction:', error);
    res.status(500).json({ message: 'Error creating transaction', error: error.message });
  }
};

// Get transaction by either MongoDB ID or client UUID
exports.getTransaction = async (req, res) => {
  try {
    const { id } = req.params;
    let transaction;

    // Try to find by MongoDB ID first
    if (id.match(/^[0-9a-fA-F]{24}$/)) {
      transaction = await Transaction.findById(id);
    }

    // If not found, try to find by client UUID
    if (!transaction) {
      transaction = await Transaction.findOne({ clientUuid: id });
    }

    if (!transaction) {
      return res.status(404).json({ message: 'Transaction not found' });
    }

    // Return both IDs in response
    res.json({
      transaction: {
        ...transaction.toObject(),
        mongoId: transaction._id,
        clientUuid: transaction.clientUuid
      }
    });
  } catch (error) {
    console.error('Error getting transaction:', error);
    res.status(500).json({ message: 'Error getting transaction', error: error.message });
  }
};

// Update transaction status
exports.updateTransactionStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    let transaction;

    // Try to find by MongoDB ID first
    if (id.match(/^[0-9a-fA-F]{24}$/)) {
      transaction = await Transaction.findById(id);
    }

    // If not found, try to find by client UUID
    if (!transaction) {
      transaction = await Transaction.findOne({ clientUuid: id });
    }

    if (!transaction) {
      return res.status(404).json({ message: 'Transaction not found' });
    }

    transaction.status = status;
    await transaction.save();

    // Return both IDs in response
    res.json({
      transaction: {
        ...transaction.toObject(),
        mongoId: transaction._id,
        clientUuid: transaction.clientUuid
      }
    });
  } catch (error) {
    console.error('Error updating transaction status:', error);
    res.status(500).json({ message: 'Error updating transaction status', error: error.message });
  }
}; 