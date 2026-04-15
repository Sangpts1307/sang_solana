* bỏ phần giới hạn max đi, có min thì cũng hay sử dụng
* Viết test kỹ hơn, kiểu như của Trang 
* viết vào package thêm 1 cái để chạy lại test, để không phải 'anchor test' nữa, mà test luôn

(gọi lại vào cái bank-app.ts -> kiểu dạng api run test,..)

* Kiểm tra xem pause rồi thì có chạy withdraw với các thứ đc không



* nếu chạy npm run dev sẽ vào cái dev trong package
* npm run test thì chạy vào test luôn









Kiến thức buổi mới:

* ata: -> nhìn ở more info thấy isOnCurve = false thì là do con người tạo ra
* cách tạo token ata: (dòng 34->...) ở deposit\_token
* bank\_ata: 
* decimal: là đơn vị nhỏ nhất nếu có thể chia ra, thường thì decimal là 9 hay là 6
* lệnh tạo token: spl-token create token
* lệnh tạo ata (account): 
* mint ra token
* xem cái kiến trúc của ata trong cái readme

btvn: thêm hàm pause, withdraw (lấy từ bài 03)

btvn vẫn là btap về token\_transfer\_from\_user: đọc để hiểu là ok

nhớ viết test kỹ 

* 



viết withdraw\_token với deposit\_token, bổ sung mấy cái trống,... hehe

\-> wap sol: do cái 

