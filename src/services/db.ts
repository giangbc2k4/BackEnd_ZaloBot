import { supabase } from '../config/supabase.js';

/**
 * Tìm profile người thuê bằng chat_id Zalo
 */
export async function getTenantProfileByChatId(chatId: string) {
  const { data, error } = await supabase
    .from('tenant_records')
    .select('*, contracts!contracts_tenant_record_id_fkey!inner(*, rooms(*))')
    .eq('chat_id', chatId)
    .eq('contracts.status', 'active')
    .single();

  if (error || !data) {
    console.error(`Không tìm thấy tenant cho chat_id ${chatId}:`, error?.message);
    return null;
  }
  return data;
}

/**
 * Tìm người thuê bằng số điện thoại (chủ nhà đã nhập trên web)
 */
export async function findTenantByPhone(phone: string) {
  // Chuẩn hóa SĐT: bỏ khoảng trắng, dấu chấm, dấu gạch
  const cleanPhone = phone.replace(/[\s\.\-]/g, '');

  const { data, error } = await supabase
    .from('tenant_records')
    .select('*, contracts!contracts_tenant_record_id_fkey!inner(*, rooms(*))')
    .eq('contracts.status', 'active')
    .or(`phone.eq.${cleanPhone},phone.eq.0${cleanPhone},phone.eq.+84${cleanPhone.replace(/^0/, '')}`)
    .is('chat_id', null) // Chỉ tìm những ai chưa liên kết Zalo
    .single();

  if (error || !data) {
    console.log(`Không tìm thấy tenant chưa liên kết cho SĐT ${cleanPhone}:`, error?.message);
    return null;
  }
  return data;
}

/**
 * Liên kết chat_id Zalo vào profile người thuê
 */
export async function linkChatIdToProfile(profileId: string, chatId: string) {
  const { error } = await supabase
    .from('tenant_records')
    .update({ chat_id: chatId })
    .eq('id', profileId);

  if (error) {
    console.error(`Lỗi liên kết chat_id cho profile ${profileId}:`, error);
    return false;
  }
  console.log(`✅ Đã liên kết chat_id ${chatId} → profile ${profileId}`);
  return true;
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
  const prevMonth = params.month === 1 ? 12 : params.month - 1;
  const prevYear = params.month === 1 ? params.year - 1 : params.year;

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
    payload.status = 'pending';
    payload.source = 'zalo_bot';
    payload.submitted_at = new Date().toISOString();

    const { error } = await supabase
      .from('meter_readings')
      .update(payload)
      .eq('id', existing.id);
    
    if (error) throw error;
  } else {
    const { data: prevReading } = await supabase
      .from('meter_readings')
      .select('electric_new, water_new')
      .eq('room_id', params.roomId)
      .eq('month', prevMonth)
      .eq('year', prevYear)
      .maybeSingle();

    // Insert mới
    const { error } = await supabase
      .from('meter_readings')
      .insert({
        room_id: params.roomId,
        month: params.month,
        year: params.year,
        electric_old: prevReading?.electric_new || 0,
        electric_new: params.electricNew ?? prevReading?.electric_new ?? 0,
        image_electric_url: params.imageElectricUrl || null,
        water_old: prevReading?.water_new || 0,
        water_new: params.waterNew ?? prevReading?.water_new ?? 0,
        image_water_url: params.imageWaterUrl || null,
        status: 'pending',
        source: 'zalo_bot',
        submitted_at: new Date().toISOString(),
      });
    
    if (error) throw error;
  }
}

export async function getMeterReading(roomId: string, month: number, year: number) {
  const { data, error } = await supabase
    .from('meter_readings')
    .select('*')
    .eq('room_id', roomId)
    .eq('month', month)
    .eq('year', year)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function getInvoiceForZalo(invoiceId: string, ownerId: string) {
  const { data, error } = await supabase
    .from('invoices')
    .select(`
      *,
      rooms(id, name, house_id, houses(id, name, address_detail, province, phone, owner_id)),
      contracts(
        id,
        owner_id,
        tenant_records(id, full_name, phone, chat_id)
      )
    `)
    .eq('id', invoiceId)
    .single();

  if (error || !data) {
    console.error(`Khong tim thay hoa don ${invoiceId}:`, error?.message);
    return null;
  }

  const contractOwnerId = data.contracts?.owner_id;
  const houseOwnerId = data.rooms?.houses?.owner_id;
  if (contractOwnerId !== ownerId && houseOwnerId !== ownerId) {
    return null;
  }

  return data;
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
