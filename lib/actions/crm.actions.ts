/**
 * lib/actions/crm.actions.ts
 * [NEW] Logic quản lý dữ liệu Khách hàng (CRM) từ Database.
 * Updated: Fix linting error (let -> const).
 */

"use server";

import supabase from "@/lib/supabaseServer";
import { Customer, ZaloCustomerMapping } from "@/lib/types/database.types";

export type CustomerCRMView = Customer & {
  mapping_status: unknown; // Trạng thái quan hệ với Bot (is_friend...)
  bot_alias: string | null;
  last_interaction: string | null;
};

/**
 * Lấy danh sách khách hàng của một Bot từ DB
 */
export async function getCustomersFromDBAction(
  botId: string,
  limit = 50,
  page = 1,
  search = "",
): Promise<CustomerCRMView[]> {
  try {
    if (!botId) return [];

    // 1. Lấy danh sách ID khách hàng từ bảng Mapping của Bot
    // [FIX] Sử dụng const vì query builder chain method không cần reassignment
    const query = supabase
      .from("zalo_customer_mappings")
      .select("customer_id, status, bot_alias, last_interaction_at")
      .eq("bot_id", botId)
      .order("last_interaction_at", { ascending: false });

    // (Tạm thời chưa filter search sâu trong mapping, sẽ xử lý search tên ở bước sau hoặc join)

    const start = (page - 1) * limit;
    const end = start + limit - 1;

    const { data: mappings, error: mapError } = await query.range(start, end);

    if (mapError) throw new Error(mapError.message);
    if (!mappings || mappings.length === 0) return [];

    const customerIds = mappings.map((m) => m.customer_id);

    // 2. Lấy thông tin chi tiết từ bảng Customers
    let custQuery = supabase
      .from("customers")
      .select("*")
      .in("id", customerIds);

    if (search) {
      custQuery = custQuery.ilike("display_name", `%${search}%`);
    }

    const { data: customers, error: custError } = await custQuery;

    if (custError) throw new Error(custError.message);

    // 3. Merge dữ liệu (Customer Info + Mapping Info)
    const result: CustomerCRMView[] = customers.map((c) => {
      const mapInfo = mappings.find((m) => m.customer_id === c.id);
      return {
        ...c,
        mapping_status: mapInfo?.status,
        bot_alias: mapInfo?.bot_alias || null,
        last_interaction: mapInfo?.last_interaction_at || null,
      };
    });

    // Sort lại theo last_interaction (vì bước search có thể làm mất thứ tự)
    return result.sort((a, b) => {
      const timeA = new Date(a.last_interaction || 0).getTime();
      const timeB = new Date(b.last_interaction || 0).getTime();
      return timeB - timeA;
    });
  } catch (error: unknown) {
    console.error("[CRM] Get Customers Error:", error);
    return [];
  }
}

/**
 * Cập nhật thông tin CRM (Tags, Notes)
 */
export async function updateCustomerCRMAction(
  customerId: string,
  updateData: { tags?: string[]; notes?: string },
) {
  try {
    const { error } = await supabase
      .from("customers")
      .update(updateData)
      .eq("id", customerId);

    if (error) throw new Error(error.message);
    return { success: true };
  } catch (error: unknown) {
    const err = error instanceof Error ? error.message : String(error);
    return { success: false, error: err };
  }
}
