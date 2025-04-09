const mongoose = require('mongoose');
const { Admin } = require('../src/models/admin.model');
require('dotenv').config();

async function createAdminUser() {
  try {
    // Connect to MongoDB
    const mongoUri = process.env.MONGODB_URI;
    console.log('Connecting to MongoDB...');
    
    if (!mongoUri) {
      console.error('❌ ERROR: MONGODB_URI environment variable is not defined!');
      process.exit(1);
    }
    
    // Hide connection string details when logging
    const sanitizedUri = mongoUri.replace(/\/\/([^:]+):([^@]+)@/, '//****:****@');
    console.log('Using connection string:', sanitizedUri);
    
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB');

    const adminEmail = process.env.ADMIN_EMAIL || 'admin@example.com';
    const adminPassword = process.env.ADMIN_PASSWORD || 'SecureAdmin@2025!';
    const adminRole = process.env.ADMIN_ROLE || 'ADMIN';

    console.log('Using admin email:', adminEmail);

    // Check if admin already exists
    const existingAdmin = await Admin.findOne({ email: adminEmail });
    if (existingAdmin) {
      console.log('Admin user exists, updating password and role...');
      existingAdmin.password = adminPassword;
      existingAdmin.role = adminRole;
      await existingAdmin.save();
      console.log('✅ Admin password and role updated successfully');
      console.log('You can now login with:');
      console.log(`- Email: ${adminEmail}`);
      console.log(`- Password: [HIDDEN FOR SECURITY]`);
      process.exit(0);
    }

    // Create admin user
    const admin = new Admin({
      email: adminEmail,
      password: adminPassword,
      role: adminRole
    });

    await admin.save();
    console.log('✅ Admin user created successfully');
    console.log('You can now login with:');
    console.log(`- Email: ${adminEmail}`);
    console.log(`- Password: [HIDDEN FOR SECURITY]`);
    process.exit(0);
  } catch (error) {
    console.error('❌ Error creating/updating admin user:', error);
    console.error('Error details:', error.message);
    
    if (error.code === 11000) {
      console.error('Duplicate key error - admin email already exists');
    }
    
    // Check for common connection errors
    if (error.name === 'MongoServerSelectionError') {
      console.error('Could not connect to MongoDB server. Please check your connection string and network.');
    }
    
    process.exit(1);
  }
}

createAdminUser(); 