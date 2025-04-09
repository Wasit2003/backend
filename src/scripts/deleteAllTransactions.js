const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
const mongoose = require('mongoose');
const { Transaction } = require('../models/transaction.model');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const deleteAllTransactions = async () => {
  try {
    // Connect to MongoDB
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB:', process.env.MONGODB_URI);

    // Count transactions before deletion
    const transactionCount = await Transaction.countDocuments();
    console.log(`\nFound ${transactionCount} transactions in the database.`);
    
    if (transactionCount === 0) {
      console.log('No transactions to delete.');
      rl.close();
      return;
    }

    // Ask for confirmation
    rl.question('\n⚠️ WARNING: This will permanently delete ALL transactions. This action cannot be undone. \nType "DELETE" to confirm: ', async (answer) => {
      if (answer.trim().toUpperCase() === 'DELETE') {
        console.log('\nDeleting all transactions...');
        
        // Delete all transactions
        const result = await Transaction.deleteMany({});
        
        console.log(`\n✅ Successfully deleted ${result.deletedCount} transactions.`);
      } else {
        console.log('\nOperation cancelled. No transactions were deleted.');
      }
      
      // Close the MongoDB connection and readline interface
      await mongoose.connection.close();
      console.log('Disconnected from MongoDB.');
      rl.close();
    });
  } catch (error) {
    console.error('Error:', error.message);
    rl.close();
    process.exit(1);
  }
};

// Execute the function
deleteAllTransactions();

// Handle readline close
rl.on('close', () => {
  process.exit(0);
}); 