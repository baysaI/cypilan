const t = require('./helpers');
const User = require('../models/User');

t.run('Admin User Edit Tests', async (db) => {
  // Create a regular user
  const userId = t.makeUser(db, 'editme@test.local', 'Eski İsim', 'user');

  // 1. Admin updates user details (name, role, company)
  await User.update(userId, {
    full_name: 'Yeni İsim',
    email: 'newemail@test.local',
    phone: '05330000000',
    role: 'agent',
    company_name: 'Kıbrıs Emlak A.Ş.'
  });

  const updatedUser = await User.findById(userId);
  t.assertEqual(updatedUser.full_name, 'Yeni İsim', 'Full name updated successfully');
  t.assertEqual(updatedUser.email, 'newemail@test.local', 'Email updated successfully');
  t.assertEqual(updatedUser.phone, '05330000000', 'Phone updated successfully');
  t.assertEqual(updatedUser.role, 'agent', 'Role updated to agent successfully');
  t.assertEqual(updatedUser.company_name, 'Kıbrıs Emlak A.Ş.', 'Company name updated successfully');

  // 2. Admin resets user password
  await User.setPassword(userId, 'YeniSifre123!');
  const checkLogin = await User.findByEmail('newemail@test.local');
  const bcrypt = require('bcryptjs');
  const isPasswordMatch = await bcrypt.compare('YeniSifre123!', checkLogin.password_hash);
  t.assert(isPasswordMatch, 'Password reset by admin verifies against bcrypt');
});
