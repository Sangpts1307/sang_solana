import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAnchorWallet, useConnection } from '@solana/wallet-adapter-react';
import { BankAppContract, getErrorMessage } from '../contracts/BankAppContract';
import { LAMPORTS_PER_SOL } from '@solana/web3.js';

function BankAppInteract() {
  const { connection } = useConnection();
  const wallet = useAnchorWallet();
  const [tab, setTab] = useState<'deposit' | 'withdraw'>('deposit');
  const [amount, setAmount] = useState('');
  const [userReserve, setUserReserve] = useState(0);
  const [walletBalance, setWalletBalance] = useState(0);
  const [loading, setLoading] = useState(false);
  const [txSignature, setTxSignature] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const contract = useMemo(() => {
    if (!wallet) {
      return null;
    }
    return new BankAppContract(connection, wallet);
  }, [connection, wallet]);

  const refreshReserve = useCallback(async () => {
    if (!contract) {
      return;
    }
    try {
      const sol = await contract.fetchUserReserveSol();
      setUserReserve(sol);
    } catch (fetchError) {
      console.error('fetchUserReserve error:', fetchError);
      setUserReserve(0);
    }
  }, [contract]);

  const refreshWalletBalance = useCallback(async () => {
    if (!wallet) return;
    try {
      const lamports = await connection.getBalance(wallet.publicKey);
      setWalletBalance(lamports / LAMPORTS_PER_SOL);
    } catch (fetchError) {
      console.error('fetchWalletBalance error:', fetchError);
      setWalletBalance(0);
    }
  }, [connection, wallet]);

  useEffect(() => {
    void refreshReserve();
    void refreshWalletBalance();
  }, [refreshReserve, refreshWalletBalance]);

  useEffect(() => {
    if (!wallet) return;

    const subscriptionId = connection.onAccountChange(wallet.publicKey, () => {
      void refreshWalletBalance();
    });

    return () => {
      void connection.removeAccountChangeListener(subscriptionId);
    };
  }, [connection, refreshWalletBalance, wallet]);

  const handleDeposit = async () => {
    if (!contract) {
      return;
    }
    setLoading(true);
    setError(null);
    setTxSignature(null);
    try {
      const tx = await contract.deposit(amount);
      setTxSignature(tx);
      setAmount('');
      await Promise.all([refreshReserve(), refreshWalletBalance()]);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const handleWithdraw = async () => {
    // Withdraw flow intentionally left blank for now.
  };

  if (!wallet || !contract) {
    return (
      <div className="card">
        <p>Đang khởi tạo kết nối với program...</p>
      </div>
    );
  }

  return (
    <div className="card bank-interact">
      <div className="trade-tabs">
        <button
          className={`trade-tab ${tab === 'deposit' ? 'active' : ''}`}
          onClick={() => {
            setTab('deposit');
            setError(null);
            setTxSignature(null);
          }}
          disabled={loading}
        >
          Nạp token
        </button>
        <button
          className={`trade-tab ${tab === 'withdraw' ? 'active' : ''}`}
          onClick={() => {
            setTab('withdraw');
            setError(null);
            setTxSignature(null);
          }}
          disabled={loading}
        >
          Rút token
        </button>
      </div>

      <div className="trade-content">
        <div>
          <div className="trade-header-row">
            <label className="trade-label">Chọn Token &amp; Số lượng</label>
            <span className="trade-balance">
              {tab === 'deposit' ? walletBalance.toFixed(4) : userReserve.toFixed(4)} SOL
            </span>
          </div>

          <div className="trade-form-grid">
            <button className="trade-token-button" disabled>
              <div className="trade-token-button-left">
                <div className="trade-token-icon">◎</div>
                <span className="trade-token-symbol">SOL</span>
              </div>
            </button>

            <div className="trade-amount-field">
              <input
                type="text"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                disabled={loading}
              />
            </div>
          </div>
        </div>

        <button
          className="trade-submit-button"
          onClick={() => void (tab === 'deposit' ? handleDeposit() : handleWithdraw())}
          disabled={loading || amount.trim().length === 0}
        >
          {loading ? 'Đang xử lý...' : 'Xác nhận giao dịch'}
        </button>
      </div>

      {txSignature && (
        <div className="tx-result success">
          <p>Giao dịch thành công!</p>
          <a
            href={`https://explorer.solana.com/tx/${txSignature}?cluster=devnet`}
            target="_blank"
            rel="noopener noreferrer"
          >
            Xem trên Solana Explorer ↗
          </a>
        </div>
      )}

      {error && (
        <div className="tx-result error">
          <p>Lỗi: {error}</p>
        </div>
      )}
    </div>
  );
}

export default BankAppInteract;
