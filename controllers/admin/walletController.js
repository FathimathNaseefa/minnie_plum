const Transaction = require('../../models/transactionSchema');

const getWallet = async (req, res) => {
  try {
    const transactions = await Transaction.find()
      .populate('user', 'name email')
      .lean();
    res.render('admin-wallet', { transactions, currentPage: 'Wallet' });
  } catch (error) {
    res.status(500).send('Error fetching transactions');
  }
};

const transactionId = async (req, res) => {
  try {
    const transaction = await Transaction.findById(req.params.id)
      .populate('user')
      .lean();
    if (!transaction) return res.status(404).send('Transaction not found');

    res.render('admin-transaction-details', {
      transaction,
      currentPage: 'Wallet',
    });
  } catch (error) {
    res.status(500).send('Error fetching transaction details');
  }
};

module.exports = {
  getWallet,
  transactionId,
};
