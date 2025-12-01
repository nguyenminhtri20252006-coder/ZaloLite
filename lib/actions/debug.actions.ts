"use server";

import { ZaloSingletonService } from "@/lib/runtime-service";

/**
 * Lấy TOÀN BỘ thông tin User từ mọi nguồn có thể.
 * Chiến thuật: Gọi song song nhiều API và gộp kết quả.
 */
export async function getRawUserInfoAction(
  userId: string,
  phoneNumber?: string | null,
) {
  console.log(
    `[Debug Action] Aggregating ALL DATA for user: ${userId} (Phone: ${phoneNumber})`,
  );

  const service = ZaloSingletonService.getInstance();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const aggregatedResult: Record<string, any> = {
    target_id: userId,
    target_phone: phoneNumber,
    fetched_at: new Date().toISOString(),
    sources: {},
  };

  try {
    // 1. Nguồn: Profile Nhóm/Bạn bè (Thường đầy đủ nhất về hiển thị)
    const p1 = service
      .getGroupMembersInfo([userId])
      .then((res) => {
        if (res.profiles && res.profiles[userId]) {
          aggregatedResult.sources.group_member_profile = res.profiles[userId];
        }
      })
      .catch(
        (e) =>
          (aggregatedResult.sources.group_member_profile_error = e.message),
      );

    // 2. Nguồn: Public Profile (Dành cho người lạ)
    const p2 = service
      .getUserInfo(userId)
      .then((res) => {
        if (res.changed_profiles && res.changed_profiles[userId]) {
          aggregatedResult.sources.public_profile =
            res.changed_profiles[userId];
        }
      })
      .catch(
        (e) => (aggregatedResult.sources.public_profile_error = e.message),
      );

    // 3. Nguồn: Tìm qua SĐT (Nếu có SĐT)
    let p3 = Promise.resolve();
    if (phoneNumber) {
      p3 = service
        .findUser(phoneNumber)
        .then((res) => {
          aggregatedResult.sources.phone_lookup_data = res;
        })
        .catch(
          (e) => (aggregatedResult.sources.phone_lookup_error = e.message),
        );
    }

    // 4. Nguồn: Kiểm tra xem có phải bạn bè không (Danh sách bạn bè)
    // Lưu ý: Cái này lấy từ cache của service, không gọi API mạng
    // Tuy nhiên ZCA JS không expose trực tiếp hàm check friend lẻ, nên ta bỏ qua để tránh chậm.

    // Đợi tất cả hoàn tất
    await Promise.all([p1, p2, p3]);

    return aggregatedResult;
  } catch (error: unknown) {
    console.error("[Debug Action] Fatal Error:", error);
    return {
      error: error instanceof Error ? error.message : "Unknown Error",
      partial_data: aggregatedResult,
    };
  }
}

/**
 * Lấy TOÀN BỘ thông tin Nhóm + Full list thành viên chi tiết.
 */
export async function getRawGroupInfoAction(groupId: string) {
  console.log(`[Debug Action] Aggregating ALL DATA for group: ${groupId}`);
  const service = ZaloSingletonService.getInstance();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const aggregatedResult: Record<string, any> = {
    target_group_id: groupId,
    fetched_at: new Date().toISOString(),
    sources: {},
  };

  try {
    // 1. Lấy Metadata nhóm (Tên, setting, list ID thành viên)
    const groupInfoRes = await service.getGroupInfo([groupId]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const infoMap = (groupInfoRes as any).gridInfoMap;
    const groupMeta = infoMap ? infoMap[groupId] : null;

    if (groupMeta) {
      aggregatedResult.sources.group_metadata = groupMeta;

      // 2. Nếu có danh sách thành viên, LẤY LUÔN CHI TIẾT TỪNG THÀNH VIÊN
      // Đây là phần làm cho JSON "dài" và đầy đủ như bạn muốn
      if (groupMeta.memVerList && Array.isArray(groupMeta.memVerList)) {
        console.log(
          `[Debug Action] Fetching details for ${groupMeta.memVerList.length} members...`,
        );

        // Chunking nếu nhóm quá đông (tránh lỗi 114)
        const memberIds = groupMeta.memVerList;
        const chunkSize = 20;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const allMembersDetails: Record<string, any> = {};

        for (let i = 0; i < memberIds.length; i += chunkSize) {
          const chunk = memberIds.slice(i, i + chunkSize);
          try {
            const membersRes = await service.getGroupMembersInfo(chunk);
            Object.assign(allMembersDetails, membersRes.profiles || {});
          } catch (e) {
            console.warn(`Failed to fetch member chunk ${i}`, e);
          }
        }

        aggregatedResult.sources.full_members_details = allMembersDetails;
      }
    } else {
      aggregatedResult.error = "Group Metadata not found via getGroupInfo";
    }

    return aggregatedResult;
  } catch (error: unknown) {
    return {
      source: "exception",
      error: error instanceof Error ? error.message : "Lỗi không xác định",
    };
  }
}
