import Redis from 'ioredis';

export type BotState = 'IDLE' | 'WAIT_ELECTRIC' | 'WAIT_WATER' | 'WAIT_PAYMENT' | 'PAID';

// ─── Fallback: In-memory store nếu chưa có Redis ───
const memoryStore = new Map<string, string>();

const redisUrl = process.env.UPSTASH_REDIS_URL;
let redis: Redis | null = null;

if (redisUrl) {
  try {
    redis = new Redis(redisUrl, {
      maxRetriesPerRequest: 3,
      retryStrategy(times) {
        if (times > 3) return null; // Ngừng retry sau 3 lần
        return Math.min(times * 200, 2000);
      },
      lazyConnect: true, // Không kết nối ngay khi khởi tạo
    });

    redis.on('error', (err) => {
      console.error('[Redis] Lỗi kết nối:', err.message);
    });

    redis.on('connect', () => {
      console.log('✅ [Redis] Đã kết nối Upstash thành công!');
    });

    // Thử kết nối
    redis.connect().catch(() => {
      console.warn('⚠️ [Redis] Không kết nối được. Dùng bộ nhớ tạm (in-memory).');
      redis = null;
    });
  } catch {
    console.warn('⚠️ [Redis] Khởi tạo lỗi. Dùng bộ nhớ tạm (in-memory).');
    redis = null;
  }
} else {
  console.warn('⚠️ Thiếu UPSTASH_REDIS_URL. Dùng bộ nhớ tạm (in-memory) cho State Machine.');
}

/**
 * Lấy trạng thái hiện tại của người dùng Zalo
 */
export async function getState(chatId: string): Promise<BotState> {
  try {
    if (redis) {
      const state = await redis.get(`bot_state:${chatId}`);
      return (state as BotState) || 'IDLE';
    }
    return (memoryStore.get(chatId) as BotState) || 'IDLE';
  } catch (error) {
    console.error(`Lỗi khi lấy state cho ${chatId}:`, error);
    return (memoryStore.get(chatId) as BotState) || 'IDLE';
  }
}

/**
 * Cập nhật trạng thái của người dùng Zalo
 */
export async function setState(chatId: string, state: BotState): Promise<void> {
  try {
    if (redis) {
      await redis.set(`bot_state:${chatId}`, state);
    }
    // Luôn lưu vào memory làm backup
    memoryStore.set(chatId, state);
    console.log(`[State] ${chatId} -> ${state}`);
  } catch (error) {
    console.error(`Lỗi khi cập nhật state cho ${chatId}:`, error);
    memoryStore.set(chatId, state);
  }
}

/**
 * Xóa trạng thái (trở về IDLE)
 */
export async function clearState(chatId: string): Promise<void> {
  try {
    if (redis) {
      await redis.del(`bot_state:${chatId}`);
    }
    memoryStore.delete(chatId);
    console.log(`[State] ${chatId} -> IDLE (Cleared)`);
  } catch (error) {
    console.error(`Lỗi khi xóa state cho ${chatId}:`, error);
    memoryStore.delete(chatId);
  }
}
