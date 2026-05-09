import { supabase } from '../config/supabase.js';

/**
 * Tìm profile người thuê bằng chat_id Zalo
 */
export async function getTenantProfileByChatId(chatId: string) {
  const { data, error } = await supabase
    .from('profiles')
    .select('*, contracts!inner(*, rooms(*))')
    .eq('chat_id', chatId)
    .eq('role', 'tenant')
    .eq('contracts.status', 'active')
    .single();

  if (error || !data) {
    console.error(`Không tìm thấy tenant cho chat_id ${chatId}:`, error?.message);
    return null;
  }
  return data;
}

/**
 * Cập nhật hoặc chèn mới chỉ số điện/nước cho phòng trong tháng
 */
export async function upsertMeterReading(params: {
  roomId: string;
  month: number;
  year: number;
  electricNew?: number;
  imageElectricUrl?: string;
  waterNew?: number;
  imageWaterUrl?: string;
}) {
  // Tìm xem tháng này đã có bản ghi chưa
  let { data: existing } = await supabase
    .from('meter_readings')
    .select('*')
    .eq('room_id', params.roomId)
    .eq('month', params.month)
    .eq('year', params.year)
    .single();

  if (existing) {
    // Update
    const payload: any = {};
    if (params.electricNew !== undefined) payload.electric_new = params.electricNew;
    if (params.imageElectricUrl) payload.image_electric_url = params.imageElectricUrl;
    if (params.waterNew !== undefined) payload.water_new = params.waterNew;
    if (params.imageWaterUrl) payload.image_water_url = params.imageWaterUrl;

    const { error } = await supabase
      .from('meter_readings')
      .update(payload)
      .eq('id', existing.id);
    
    if (error) throw error;
  } else {
    // Insert mới
    const { error } = await supabase
      .from('meter_readings')
      .insert({
        room_id: params.roomId,
        month: params.month,
        year: params.year,
        electric_new: params.electricNew || 0,
        image_electric_url: params.imageElectricUrl || null,
        water_new: params.waterNew || 0,
        image_water_url: params.imageWaterUrl || null,
      });
    
    if (error) throw error;
  }
}

/**
 * Tính toán và tạo hóa đơn tháng này
 */
export async function calculateInvoice(roomId: string, contractId: string, month: number, year: number) {
  // Lấy giá phòng
  const { data: contract } = await supabase.from('contracts').select('rent_price').eq('id', contractId).single();
  
  // Lấy chỉ số tháng này
  const { data: reading } = await supabase
    .from('meter_readings')
    .select('*')
    .eq('room_id', roomId)
    .eq('month', month)
    .eq('year', year)
    .single();

  // (Mock) Lấy chỉ số tháng trước để tính số sử dụng. Ở đây để đơn giản ta lấy luôn electric_new * giá
  // Thực tế: lấy electric_new - electric_old
  const electricUsage = reading.electric_new - reading.electric_old;
  const electricAmount = (electricUsage > 0 ? electricUsage : reading.electric_new) * reading.electric_price;
  
  const waterUsage = reading.water_new - reading.water_old;
  const waterAmount = (waterUsage > 0 ? waterUsage : reading.water_new) * reading.water_price;
  
  const rentAmount = contract?.rent_price || 0;
  const totalAmount = Number(rentAmount) + Number(electricAmount) + Number(waterAmount);

  // Lưu invoice
  const { data: invoice, error } = await supabase
    .from('invoices')
    .upsert({
      room_id: roomId,
      contract_id: contractId,
      month,
      year,
      rent_amount: rentAmount,
      electric_amount: electricAmount,
      water_amount: waterAmount,
      total_amount: totalAmount,
      status: 'pending'
    }, { onConflict: 'room_id,month,year' })
    .select()
    .single();

  if (error) throw error;
  
  return invoice;
}
