2. File Test (tests/bank-app.ts) đang kiểm tra những gì?
   Trong file test, chúng ta sử dụng thư viện @solana/spl-token và chai để thực hiện kiểm thử tự động một luồng ngân hàng hoàn chỉnh, bao gồm cả SOL và Token.

Các bước mà file test này đang thực hiện:

🛠️ Chuẩn bị môi trường (Hàm before):
Tạo ra một Mock Token (Token rác để test) có đuôi thập phân là 9.
Tạo ATA cho User (người chạy test) và in "từ trên trời rơi xuống" (mint) cho họ 10 Token vào tài khoản này để lấy vốn test.
Lấy tính toán sẵn địa chỉ ATA của Bank Vault (tức là kho sẽ để dành chứa Token này của ngân hàng).
🧪 Các kịch bản Test chi tiết:
Initialize system: Gọi lệnh Setup khởi tạo BankInfo và BankVault PDA.
Deposit SOL:
Gửi 1 native SOL vào bankVault.
Kiểm tra xem dữ liệu trong userReserve (sổ cái PDA) của user có tăng lên đúng 1 SOL không.
Withdraw SOL:
Rút 0.5 native SOL ra.
Đảm bảo số dư trong userReserve bị trừ đi đúng 0.5 SOL thành công.
Deposit Token: (Phần quan trọng của chương 04)
Kiểm tra xem Bank đã có địa chỉ hòm chứa Token (bankAta) chưa. Nếu chưa thì nối thêm lệnh tạo ATA vào Transaction.
Thực hiện chuyển 2 Token từ ví userAta sang bankAta.
Xác minh userReserve dành riêng cho Token này của người dùng tăng lên 2 Token.
Withdraw Token:
Rút lại 1 Token từ bankAta về userAta.
Chương trình tự động dùng quyền ký PDA để chuyển token.
Xác nhận userReserve của tài sản này giảm đi 1 Token.
Pause Bank:
Dùng tài khoản Admin cắm cờ isPaused = true.
Cannot deposit/withdraw when Paused:
Cố tình gửi thêm lệnh Nạp SOL và Rút Token.
Chặn bắt (Catch error) để xem chương trình có ném ra lỗi BankAppPaused hay không. Phải có lỗi xảy ra thì bài test này mới Passed (✔️ xanh).
Unpause Bank:
Admin mở khoá lại ngân hàng. Xác nhận biến state đã quay về isPaused = false.
Tóm lại, bài test mô phỏng y chang quá trình người dùng thao tác thực tế với Front-end, đảm bảo Smart Contract phòng chống triệt để các hành vi nạp/rút sai số dư, hoặc cố tình giao dịch khi ngân hàng đang nhận lệnh phong tỏa.
