# Tổng kết Phần 02: Vòng đời sản phẩm trên Solana

Chúng ta đã cùng nhau đi qua toàn bộ quy trình phát triển chuyên nghiệp trên Solana: từ việc triển khai mã nguồn đến khi thu hồi chi phí.

## Các cột mốc đạt được

### 1. Triển khai (Deploy)

- Đã giải quyết lỗi `Already in use` bằng cách tạo Program ID mới: `EDfskqkUwNcbwCY83uhj3XKjnnr1QdwN8mjUkPgzUTjx`.
- Giao dịch triển khai đầu tiên thành công với chữ ký: `2MtYCz...`.

### 2. Kiểm thử (Test)

- Đã khắc phục lỗi `Simulation failed` bằng cách đồng bộ hóa `declare_id!` và chạy `anchor build` lại.
- Kết quả test: `1 passing`.
- Chữ ký giao dịch test: `4Faahyt...`.

### 3. Nâng cấp (Upgrade)

- Thử nghiệm tính năng **Upgradeability** của Solana.
- Sử dụng lệnh `solana program extend` để nới rộng thêm **10,000 byte**, tránh lỗi thiếu bộ nhớ.
- Cập nhật thông tin thành công (`age = 25`).

### 4. Thu hồi (Close)

- Sử dụng lệnh `solana program close` với cờ `--bypass-warning`.
- Thu hồi thành công **1.284 SOL**.
- Số dư cuối cùng: **9.99619856 SOL**.

## Thông tin Báo cáo cuối cùng

| Thông tin                 | Giá trị                                                                                    |
| :------------------------ | :----------------------------------------------------------------------------------------- |
| **Địa chỉ ví**            | `HTxffo8RU245wuXfyh3LE3nBBHoTCntZtKaUcy42pSKc`                                             |
| **Địa chỉ chương trình**  | `EDfskqkUwNcbwCY83uhj3XKjnnr1QdwN8mjUkPgzUTjx`                                             |
| **Chữ ký giao dịch test** | `4FaahytBDnjxwaZsvG21GmSbCGGjEpoejhjLoXQjjnyPa9NeNsZdzTgDjaebKnHArANk99iUjw8noXMzEkQA5haW` |

---

> [!TIP]
> Bạn luôn có thể dùng lại ví `HTxffo...` này cho các bài học tiếp theo (Part 03, 04...). Hãy giữ kỹ file `id.json` nhé!
