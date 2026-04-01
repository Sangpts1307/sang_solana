Lesson 1

<!-- Kiểm tra cấu hình hiện tại -->

bash
solana config get && solana balance

Nếu kết quả chưa có ví hoặc balance = 0, hãy chạy các bước thiết lập cuối cùng của phần 01 này:

<!-- Tạo ví mới (nếu chưa có): -->

bash
solana-keygen new --outfile $HOME/.config/solana/id.json --force
->> Trả về:
Generating a new keypair

For added security, enter a BIP39 passphrase

NOTE! This passphrase improves security of the recovery seed phrase NOT the  
keypair file itself, which is stored as insecure plain text

BIP39 Passphrase (empty for none): '1 đến 6'
Enter same passphrase again: '1 đến 6'

# Wrote new keypair to /home/sang_blockchain/.config/solana/id.json

# pubkey: HTxffo8RU245wuXfyh3LE3nBBHoTCntZtKaUcy42pSKc

Save this seed phrase and your BIP39 passphrase to recover your new keypair:
review wrap struggle steak mixture script change believe race orient female job
==============================================================================='

<!-- Cấu hình sang mạng Devnet: -->

bash
solana config set -u devnet
->> trả về:
Config File: /home/sang_blockchain/.config/solana/cli/config.yml
RPC URL: https://api.devnet.solana.com
WebSocket URL: wss://api.devnet.solana.com/ (computed)
Keypair Path: /home/sang_blockchain/.config/solana/id.json
Commitment: confirmed

<!-- Lấy SOL thử nghiệm (Airdrop): -->

bash
solana airdrop 5
