/**
 * VietQR — Tạo URL ảnh QR chuyển khoản ngân hàng
 * Chuẩn NAPAS, miễn phí hoàn toàn, hỗ trợ 40+ ngân hàng
 */

// Cấu hình ngân hàng chủ nhà (lấy từ .env)
const BANK_ID = process.env.BANK_ID || 'MB';            // Mã ngân hàng: MB, VCB, TCB, BIDV...
const ACCOUNT_NO = process.env.BANK_ACCOUNT_NO || '';    // Số tài khoản
const ACCOUNT_NAME = process.env.BANK_ACCOUNT_NAME || ''; // Tên chủ tài khoản

export interface InvoiceForQR {
  roomName: string;
  month: number;
  year: number;
  totalAmount: number;
}

/**
 * Tạo URL ảnh QR VietQR từ thông tin hóa đơn
 */
export function buildVietQR(invoice: InvoiceForQR): string {
  const addInfo = `Phong${invoice.roomName} thang${invoice.month} ${invoice.year}`;

  const params = new URLSearchParams({
    amount: String(invoice.totalAmount),
    addInfo,
    accountName: ACCOUNT_NAME
  });

  return `https://img.vietqr.io/image/${BANK_ID}-${ACCOUNT_NO}-compact2.png?${params}`;
}

/**
 * Tạo caption hóa đơn gửi kèm ảnh QR
 */
export function formatInvoiceCaption(invoice: {
  roomName: string;
  month: number;
  year: number;
  rentAmount: number;
  electricAmount: number;
  waterAmount: number;
  totalAmount: number;
}): string {
  const fmt = (n: number) => n.toLocaleString('vi-VN');

  return [
    `📋 HÓA ĐƠN THÁNG ${invoice.month}/${invoice.year}`,
    `🏠 Phòng: ${invoice.roomName}`,
    ``,
    `💰 Tiền phòng: ${fmt(invoice.rentAmount)}đ`,
    `⚡ Tiền điện: ${fmt(invoice.electricAmount)}đ`,
    `💧 Tiền nước: ${fmt(invoice.waterAmount)}đ`,
    ``,
    `🔴 TỔNG CỘNG: ${fmt(invoice.totalAmount)}đ`,
    ``,
    `Quét mã QR bên trên để chuyển khoản nhé!`
  ].join('\n');
}
