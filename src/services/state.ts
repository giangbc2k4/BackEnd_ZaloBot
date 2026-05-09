import Redis from 'ioredis';

const redisUrl = process.env.UPSTASH_REDIS_URL;

if (!redisUrl) {
  console.warn("⚠️ Thiếu UPSTASH_REDIS_URL trong file .env. State Machine sẽ không hoạt động!");
}

export const redis = new Redis(redisUrl || 'redis://localhost:6379');

export type BotState = 'IDLE' | 'WAIT_ELECTRIC' | 'WAIT_WATER' | 'WAIT_PAYMENT' | 'PAID';

/**
 * Lấy trạng thái hiện tại của người dùng Zalo
 */
export async function getState(chatId: string): Promise<BotState> {
  try {
    const state = await redis.get(`bot_state:${chatId}`);
    return (state as BotState) || 'IDLE';
  } catch (error) {
    console.error(`Lỗi khi lấy state cho ${chatId}:`, error);
    return 'IDLE';
  }
}

/**
 * Cập nhật trạng thái của người dùng Zalo
 */
export async function setState(chatId: string, state: BotState): Promise<void> {
  try {
    // Lưu state vô thời hạn hoặc có thể set TTL nếu muốn tự reset (VD: 30 ngày = 2592000s)
    await redis.set(`bot_state:${chatId}`, state);
    console.log(`[State] ${chatId} -> ${state}`);
  } catch (error) {
    console.error(`Lỗi khi cập nhật state cho ${chatId}:`, error);
  }
}

/**
 * Xóa trạng thái (trở về IDLE)
 */
export async function clearState(chatId: string): Promise<void> {
  try {
    await redis.del(`bot_state:${chatId}`);
    console.log(`[State] ${chatId} -> IDLE (Cleared)`);
  } catch (error) {
    console.error(`Lỗi khi xóa state cho ${chatId}:`, error);
  }
}
