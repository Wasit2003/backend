const mongoose = require('mongoose');
const { Admin } = require('../src/models/admin.model');
require('dotenv').config();

async function createAdminUser() {
  try {
    // Connect to MongoDB
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/wallet_dev';
    console.log('Connecting to MongoDB at:', mongoUri);
    await mongoose.connect(mongoUri);
    console.log('Connected to MongoDB');

    const adminEmail = process.env.ADMIN_EMAIL || 'admin@example.com';
    const adminPassword = process.env.ADMIN_PASSWORD || 'adminpass';
    const adminRole = process.env.ADMIN_ROLE || 'ADMIN';

    console.log('Using admin email:', adminEmail);

    // Check if admin already exists
    const existingAdmin = await Admin.findOne({ email: adminEmail });
    if (existingAdmin) {
      console.log('Admin user exists, updating password...');
      existingAdmin.password = adminPassword;
      existingAdmin.role = adminRole;
      await existingAdmin.save();
      console.log('Admin password and role updated successfully');
      console.log('You can now login with:');
      console.log(`- Email: ${adminEmail}`);
      console.log(`- Password: ${adminPassword}`);
      process.exit(0);
    }

    // Create admin user
    const admin = new Admin({
      email: adminEmail,
      password: adminPassword,
      role: adminRole
    });

    await admin.save();
    console.log('Admin user created successfully');
    console.log('You can now login with:');
    console.log(`- Email: ${adminEmail}`);
    console.log(`- Password: ${adminPassword}`);
    process.exit(0);
  } catch (error) {
    console.error('Error creating/updating admin user:', error);
    console.error('Error details:', error.message);
    if (error.code === 11000) {
      console.error('Duplicate key error - admin email already exists');
    }
    process.exit(1);
  }
}

createAdminUser(); 