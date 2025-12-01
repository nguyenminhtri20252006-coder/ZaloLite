"use client";

/**
 * app/components/modules/UserDatabasePanel.tsx
 * [UPDATE] Giao diện bảng/lưới trực quan hơn.
 */
import { useMemo, useState } from "react";
import { UserCacheEntry, ThreadInfo } from "@/lib/types/zalo.types";
import { Avatar } from "@/app/components/ui/Avatar";
import {
  IconUsers,
  IconRefresh,
  IconPhone,
  IconCheck,
  IconClose,
  IconSearch,
} from "@/app/components/ui/Icons";
import { getRawUserInfoAction } from "@/lib/actions/debug.actions";
import { JsonViewerModal } from "@/app/components/ui/JsonViewerModal";

// Icon Code (cho nút Inspect)
const IconCode = ({ className }: { className: string }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="currentColor"
    className={className}
  >
    <path
      fillRule="evenodd"
      d="M3 6a3 3 0 013-3h2.25a3 3 0 013 3v2.25a3 3 0 01-3 3H6a3 3 0 01-3-3V6zm9.75 0a3 3 0 013-3H18a3 3 0 013 3v2.25a3 3 0 01-3 3h-2.25a3 3 0 01-3-3V6zM3 15.75a3 3 0 013-3h2.25a3 3 0 013 3V18a3 3 0 01-3 3H6a3 3 0 01-3-3v-2.25zm9.75 0a3 3 0 013-3H18a3 3 0 013 3V18a3 3 0 01-3 3h-2.25a3 3 0 01-3-3v-2.25z"
      clipRule="evenodd"
    />
  </svg>
);

export function UserDatabasePanel({
  userCache,
  threads,
  onStartManualScan,
  isScanningAll,
  scanStatus,
}: {
  userCache: Record<string, UserCacheEntry>;
  threads: ThreadInfo[];
  onStartManualScan: () => void;
  isScanningAll: boolean;
  scanStatus: string;
}) {
  const [searchTerm, setSearchTerm] = useState("");
  const [filter, setFilter] = useState<"all" | "friend" | "stranger">("all");

  // State cho JSON Viewer
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [inspectData, setInspectData] = useState<any>(null);
  const [inspectTitle, setInspectTitle] = useState("");
  const [isLoadingInspect, setIsLoadingInspect] = useState(false);

  const cachedUsers = useMemo(() => {
    let users = Object.values(userCache);

    // 1. Filter
    if (filter === "friend") users = users.filter((u) => u.isFriend);
    if (filter === "stranger") users = users.filter((u) => !u.isFriend);

    // 2. Search
    if (searchTerm) {
      const lower = searchTerm.toLowerCase();
      users = users.filter(
        (u) =>
          u.name.toLowerCase().includes(lower) ||
          u.id.includes(lower) ||
          (u.phoneNumber && u.phoneNumber.includes(lower)),
      );
    }
    return users;
  }, [userCache, searchTerm, filter]);

  // SỬA ĐỔI: Thêm tham số phoneNumber
  const handleInspect = async (
    userId: string,
    userName: string,
    phoneNumber?: string | null,
  ) => {
    if (isLoadingInspect) return;
    setIsLoadingInspect(true);
    try {
      // Gọi Action với cả ID và Phone
      const result = await getRawUserInfoAction(userId, phoneNumber);
      setInspectTitle(`${userName} (${userId})`);
      setInspectData(result);
    } catch (error) {
      setInspectTitle("Error");
      setInspectData({ error: "Failed to fetch data" });
    } finally {
      setIsLoadingInspect(false);
    }
  };

  return (
    <>
      {/* Modal Viewer */}
      {inspectData && (
        <JsonViewerModal
          title={inspectTitle}
          data={inspectData}
          onClose={() => setInspectData(null)}
        />
      )}

      <div className="flex flex-col h-full bg-gray-800 rounded-lg shadow-lg overflow-hidden border border-gray-700">
        {/* Header */}
        <div className="p-4 border-b border-gray-700 bg-gray-900">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-900/30 rounded-lg">
                <IconUsers className="h-6 w-6 text-blue-400" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-white leading-tight">
                  Database Người Dùng
                </h2>
                <p className="text-xs text-gray-400 font-mono">
                  {Object.keys(userCache).length} records cached
                </p>
              </div>
            </div>

            <button
              onClick={onStartManualScan}
              disabled={isScanningAll}
              className={`flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all shadow-sm ${
                isScanningAll
                  ? "bg-yellow-600/20 text-yellow-400 cursor-not-allowed border border-yellow-600/30"
                  : "bg-blue-600 text-white hover:bg-blue-500 hover:shadow-blue-500/20 active:scale-95"
              }`}
            >
              <IconRefresh
                className={`h-4 w-4 ${isScanningAll ? "animate-spin" : ""}`}
              />
              {isScanningAll ? "Đang quét..." : "Quét Groups"}
            </button>
          </div>

          {scanStatus && (
            <div className="mb-4 px-3 py-2 rounded bg-blue-900/20 border border-blue-800/50 text-xs text-blue-200 font-mono text-center animate-pulse">
              {scanStatus}
            </div>
          )}

          {/* Filters & Search */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1 group">
              <IconSearch className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500 group-focus-within:text-blue-400 transition-colors" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Tìm kiếm ID, Tên, SĐT..."
                className="w-full rounded-lg border border-gray-600 bg-gray-800 py-2 pl-9 pr-3 text-white text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-all"
              />
            </div>
            <div className="flex bg-gray-700/50 rounded-lg p-1 border border-gray-600">
              {(["all", "friend", "stranger"] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`flex-1 sm:flex-none px-4 py-1.5 rounded-md text-xs font-medium transition-all ${
                    filter === f
                      ? "bg-gray-600 text-white shadow-sm"
                      : "text-gray-400 hover:text-gray-200 hover:bg-gray-600/50"
                  }`}
                >
                  {f === "all"
                    ? "Tất cả"
                    : f === "friend"
                    ? "Bạn bè"
                    : "Người lạ"}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Data Grid - Responsive Fix */}
        <div className="flex-1 overflow-y-auto p-4 bg-gray-800/50">
          <div
            className="grid gap-3"
            style={{
              gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
            }}
          >
            {cachedUsers.map((user) => (
              <div
                key={user.id}
                className="group relative flex items-start gap-3 p-3 rounded-xl border border-gray-700 bg-gray-800 hover:bg-gray-750 hover:border-gray-600 transition-all duration-200 hover:shadow-md"
              >
                {/* Avatar */}
                <div className="relative shrink-0">
                  <Avatar src={user.avatar} alt={user.name} />
                  {user.isFriend && (
                    <div
                      className="absolute -bottom-1 -right-1 bg-green-500 rounded-full p-0.5 border-2 border-gray-800"
                      title="Là bạn bè"
                    >
                      <IconCheck className="h-2.5 w-2.5 text-white" />
                    </div>
                  )}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0 overflow-hidden">
                  <div className="flex justify-between items-start gap-2">
                    <h4
                      className="font-semibold text-white truncate text-sm group-hover:text-blue-400 transition-colors"
                      title={user.name}
                    >
                      {user.name}
                    </h4>
                    {/* Actions Row */}
                    <div className="flex gap-1">
                      <button
                        onClick={() =>
                          handleInspect(user.id, user.name, user.phoneNumber)
                        }
                        disabled={isLoadingInspect}
                        className="p-1 rounded bg-gray-700 hover:bg-blue-600 text-gray-400 hover:text-white transition-colors"
                        title="Xem Full JSON"
                      >
                        <IconCode className="h-3 w-3" />
                      </button>
                      <span
                        className={`text-[10px] px-1.5 py-0.5 rounded border uppercase font-bold tracking-wider ${
                          user.isFriend
                            ? "border-green-800 bg-green-900/20 text-green-400"
                            : "border-gray-600 bg-gray-700/50 text-gray-500"
                        }`}
                      >
                        {user.isFriend ? "Friend" : "Guest"}
                      </span>
                    </div>
                  </div>

                  <div className="mt-2 space-y-1.5">
                    <div
                      className="flex items-center gap-2 text-xs text-gray-500 bg-gray-900/50 p-1 rounded hover:bg-gray-900 transition-colors cursor-copy"
                      title="Click để copy ID"
                      onClick={() => navigator.clipboard.writeText(user.id)}
                    >
                      <span className="font-mono select-all truncate">
                        {user.id}
                      </span>
                    </div>

                    {user.phoneNumber && (
                      <div className="flex items-center gap-2 text-xs text-yellow-300/90">
                        <IconPhone className="h-3 w-3" />
                        <span className="font-mono select-all tracking-wide">
                          {user.phoneNumber}
                        </span>
                      </div>
                    )}

                    {user.commonGroups.size > 0 && (
                      <div className="flex items-center gap-2 text-xs text-blue-300/90">
                        <IconUsers className="h-3 w-3" />
                        <span className="truncate">
                          {user.commonGroups.size} nhóm chung
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {cachedUsers.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-gray-500 gap-3 min-h-[200px]">
              <div className="p-4 bg-gray-800 rounded-full border border-gray-700">
                <IconUsers className="h-8 w-8 opacity-20" />
              </div>
              <p className="text-sm">Không tìm thấy dữ liệu phù hợp.</p>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
