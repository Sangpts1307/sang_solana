# check address sol: solana address -> HTxffo8RU245wuXfyh3LE3nBBHoTCntZtKaUcy42pSKc

# check balance sol: solana balance ->

<!-- Chạy lệnh build trước: -->

bash
anchor build

Lấy mã Program ID thực tế: Sau khi build, Anchor sẽ tạo ra một keypair riêng cho chương trình.

<!-- Chạy lệnh này để xem mã ID thực của mình là gì: -->
<!-- đây là địa chỉ trong smart contract sẽ deploy lên -->

bash
solana address -k target/deploy/my_first_anchor_project-keypair.json
->> trả về: EDfskqkUwNcbwCY83uhj3XKjnnr1QdwN8mjUkPgzUTjx

Cập nhật id lại vào code: file lib.rs và file Anchor.toml, trong Anchor.toml thay đổi [programs.localnet] thành [programs.devnet]

<!-- Chạy để có node_modules -->

bash
yarn install

<!-- sau khi cập nhật hết id và chạy yarn install thì chạy lệnh dưới đây để deploy lên devnet -->

bash
solana program deploy target/deploy/my_first_anchor_project.so

-> trả về:
Program Id: EDfskqkUwNcbwCY83uhj3XKjnnr1QdwN8mjUkPgzUTjx
Signature: 2MtYCzTjHUvspv5gpyEa2opstsarHvkKs1Zq1e6T6w1fXsF9zYfGTbGKjm49Xvo3wTViSopnn3ZsDPCGoBDHzUna

<!-- chạy run test để kiểm tra transaction deploy lên -->

bash
anchor run test
->> trả về:
Your transaction signature 4FaahytBDnjxwaZsvG21GmSbCGGjEpoejhjLoXQjjnyPa9NeNsZdzTgDjaebKnHArANk99iUjw8noXMzEkQA5haW
✔ Is initialized! (1219ms)

1 passing (1s)
Done in 13.78s.

<!-- Đến bước Upgrate -->

<!-- Sửa code trong lib.rs (Ví dụ tăng tuổi lên 25). -->

bash
anchor build

<!-- Mở rộng bộ nhớ: solana program extend EDfskqkUwNcbwCY83uhj3XKjnnr1QdwN8mjUkPgzUTjx 10000. -->

bash
solana program extend EDfskqkUwNcbwCY83uhj3XKjnnr1QdwN8mjUkPgzUTjx 10000

<!-- Deploy lại: solana program deploy target/deploy/my_first_anchor_project.so. -->

bash
solana program deploy target/deploy/my_first_anchor_project.so
->> trả về:
sang_blockchain@DESKTOP-KD4L88O:/mnt/e/Big-O Coding/sang-solana/02 - Deploy-Test-Upgrade-Close/my-first-anchor-project$ solana program deploy target/deploy/my_first_anchor_project.so
Program Id: EDfskqkUwNcbwCY83uhj3XKjnnr1QdwN8mjUkPgzUTjx

Signature: 3L1MSCCZzkQwSe18dcwhR5doTG8Z78mLSoadijoNLK8v6e2JWYqDGNfCgsHjxpgpdzhshujtqo8Uir65AjDZx6Z2

<!-- Bước tiếp theo: Đóng chương trình -> hoàn trả sol -->

<!-- Đóng chương trình:  -->

bash
solana program close EDfskqkUwNcbwCY83uhj3XKjnnr1QdwN8mjUkPgzUTjx

<!-- có cơ chế bảo vệ lỡ xóa nhầm, nên là chạy lệnh này: -->

bash
solana program close EDfskqkUwNcbwCY83uhj3XKjnnr1QdwN8mjUkPgzUTjx --bypass-warning
->> trả về
Closed Program Id EDfskqkUwNcbwCY83uhj3XKjnnr1QdwN8mjUkPgzUTjx, 1.28440536 SOL reclaimed

<!-- Kiểm tra số dư:  -->

bash
solana balance
->> trả về
9.99619856 SOL

<!-- =>> Báo cáo:  -->

Địa chỉ ví (Wallet Address): HTxffo8RU245wuXfyh3LE3nBBHoTCntZtKaUcy42pSKc
Địa chỉ chương trình (Program ID): EDfskqkUwNcbwCY83uhj3XKjnnr1QdwN8mjUkPgzUTjx
Chữ ký giao dịch Test (Transaction Signature): 4FaahytBDnjxwaZsvG21GmSbCGGjEpoejhjLoXQjjnyPa9NeNsZdzTgDjaebKnHArANk99iUjw8noXMzEkQA5haW

# Kế hoạch Triển khai Phần 02: Quy trình Đầy đủ (Deploy -> Extend -> Upgrade -> Test -> Close)

Kế hoạch này được xây dựng dựa trên hướng dẫn của Phần 02 và các yêu cầu báo cáo cụ thể của bạn.

## Yêu cầu xem xét từ người dùng

> [!IMPORTANT]
> Tất cả các lệnh phải được thực hiện trong **WSL Terminal**. Đảm bảo bạn đã có ít nhất **2.0 SOL** trên Devnet trước khi bắt đầu.

## Các bước thực hiện chi tiết

### Giai đoạn 1: Triển khai Chương trình (Deploy)

1.  **Deploy**: Chạy lệnh `solana program deploy target/deploy/my_first_anchor_project.so`.
2.  **Xác nhận Program ID**: Lấy địa chỉ chương trình vừa được deploy thành công.
3.  **Báo cáo**: Ghi chép lại **Địa chỉ ví** và **Địa chỉ chương trình**.

### Giai đoạn 2: Nới rộng và Nâng cấp (Extend & Upgrade)

1.  **Sửa Code**: Thực hiện thay đổi nhỏ trong `lib.rs` (ví dụ: đổi `age = 25`).
2.  **Build lại**: Chạy `anchor build`.
3.  **Tính toán kích thước**: So sánh kích thước file `.so` mới với cũ.
4.  **Extend**: Mở rộng dung lượng tài khoản chương trình bằng lệnh `solana program extend <PROGRAM_ID> <new_bytes>`.
5.  **Upgrade**: Chạy lệnh deploy một lần nữa để cập nhật code mới lên cùng một Program ID.

### Giai đoạn 3: Kiểm thử và Phân tích (Test)

1.  **Chạy Test**: Thực hiện `anchor run test`.
2.  **Tìm hiểu Test**: Xem file `tests/my-first-anchor-project.ts` để hiểu cách gọi hàm `initialize`.
3.  **Ghi nhận**: Lưu lại **Chữ ký giao dịch (Transaction Signature)** của mỗi lần test thành công.

### Giai đoạn 4: Hủy chương trình (Close)

1.  **Đóng chương trình**: Chạy lệnh `solana program close <PROGRAM_ID>`.
    - _Lưu ý: Thao tác này sẽ xóa chương trình khỏi blockchain và hoàn tiền thuê bộ nhớ về ví của bạn._
2.  **Xác nhận số dư**: Kiểm tra `solana balance` để xác nhận tiền đã về ví.

### Giai đoạn 5: Tổng hợp Báo cáo (Final Report)

Sau khi hoàn thành, chúng ta sẽ tổng hợp lại thông tin theo mẫu:

- **Địa chỉ ví:** [Địa chỉ của bạn]
- **Địa chỉ chương trình:** [Địa chỉ EJ1FfT...]
- **Chữ ký giao dịch test:** [Mã Hash giao dịch]

## Kế hoạch Xác minh

### Qua CLI và Blockchain

- Dùng `solana program show <ID>` để kiểm tra trạng thái chương trình sau khi Deploy/Upgrade/Extend.
- Dùng `anchor run test` để xác minh tính đúng đắn của code.
- Kiểm tra Solscan Devnet để xem lịch sử giao dịch.
