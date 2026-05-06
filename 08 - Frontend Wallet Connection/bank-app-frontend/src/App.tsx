import { useWallet } from '@solana/wallet-adapter-react';
import WalletConnect from './components/WalletConnect';
import BankAppInteract from './components/BankAppInteract';

function App() {
  const { connected } = useWallet();

  return (
    <div className="app">
      <header className="app-header">
        <div className="app-header-top">
          <WalletConnect />
        </div>
        <div className="app-brand">
          <h1>🏦 Bank App</h1>
          <p className="app-subtitle">Solana dApp on Devnet</p>
        </div>
      </header>

      <main className="app-main">
        {connected ? (
          <>
            <BankAppInteract />
          </>
        ) : (
          <div className="connect-prompt">
            <h2>Chào mừng đến với Bank App</h2>
            <p>Kết nối ví Phantom của bạn để xem số dư, nạp SOL vào Bank App và đọc dữ liệu on-chain.</p>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
