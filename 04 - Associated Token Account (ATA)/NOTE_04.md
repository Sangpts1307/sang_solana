## Workflow chạy test cho dự án Anchor/Solana

### Lần đầu tiên (sau khi clone hoặc sửa code Rust)
```bash
anchor build               # Compile Rust → tạo file bank_app.so
anchor test --skip-build   # Deploy .so lên validator ảo → chạy test → dọn dẹp
```

### Các lần sau (chỉ sửa file TypeScript test, không sửa Rust)
```bash
anchor test --skip-build   # Dùng .so cũ, không cần build lại → nhanh hơn nhiều
```

### Tại sao KHÔNG dùng `npm run test` trực tiếp?
- `npm run test` chỉ chạy `ts-mocha`, không tự bật validator
- Cần có `solana-test-validator` chạy sẵn ở terminal khác mới dùng được
- Phức tạp hơn không cần thiết → cứ dùng `anchor test --skip-build` là đủ

### Tóm tắt quy tắc đơn giản
| Tình huống | Lệnh |
|---|---|
| Mới clone / sửa file `.rs` | `anchor build` → `anchor test --skip-build` |
| Chỉ sửa file test `.ts` | `anchor test --skip-build` |
