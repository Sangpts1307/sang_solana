Phần lib.rs thiếu mất cái exchange_rate, total_amount,... thì phải

giải cho bài toán: người gửi tiền trước phải nhận đc nhiều hơn là người sau, nếu gửi cùng 1 giá

-> làm sao để xử lý đc bài toán đấy: cách đơn giản là: phát hành 1 cái token là SHARE -> ...
vd: ban đầu gửi 100ETH -> nhận về 100 token, nếu công ty đầu tư được, thì giá trị của token SHARE đấy sẽ tăng dần theo tgian -> lúc rút thì rút bằng SHARE
công thức: exchange_rate = total assets in vault / total shares issued
vd: (đọc kỹ lại slide là hiểu)

phải thêm 1 cái hàm để tính ra ...

- tính toán lại giá trị của công ty là bao nhiêu
- trong contract chỉ cần lưu trữ total_shares, total_assets sẽ gọi sang đơn vị đầu tư xem có giá trị là bao nhiêu
- tiếp theo, Hiếu gửi 100 token, sau đó sẽ cập nhật lại total share, ...

-> khi rút tiền, tính tiền lãi dựa trên số SHARE mà mình đang nắm giữ

cần check được ví dụ Hiếu gửi vào -> tính toán ra đúng với tính tay và tính trên sol log ra số tiền khi rút về

BÀI MỚI: Version transaction (README git mới bài 5)

- trong sol, 1 giao dịch k đc truyền quá 25 account
- thay vì gửi 1 giao dịch,
  (vd: trong 1 tờ giấy, ghi hết sạch rồi, k ghi đc nữa, phải lấy tờ khác ra ghi)

- 1 vài quy tắc quan trọng:

* warmup
* append-only
* deactivation côldown
*

trong solana, có 2 loại giao dịch: ...

- vòng đời của ALT:

Bài tập:

- tạo ra 1 cái ALT, mở rộng với các tài khoản mình cần
- cần sửa bài cũ, có thể dùng lại contract, sửa lại cái test thôi
  -> xây 1 file test gửi 3 4 token liên tục -> để sử dụng cùng 1 cái ALT gửi đc 3 4 liên tục
- thay vì 1 người gửi nhiều token, thì nhiều người gửi 1 token
  => chủ yếu là viết thêm mấy hàm sử dụng ALT và viết thêm mấy hàm để tương tác với nó
