/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import React, { useState, useRef, useEffect } from "react";
import { Icons } from "@/components/ui/Icons";

interface VoiceRecorderProps {
  onSend: (file: File) => void;
  onCancel: () => void;
  disabled?: boolean;
}

export function VoiceRecorder({
  onSend,
  onCancel,
  disabled,
}: VoiceRecorderProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [duration, setDuration] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const streamRef = useRef<MediaStream | null>(null); // Keep track of stream to cleanup

  // Cleanup function logic extraction
  const stopTracks = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  };

  const cleanup = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    stopTracks();
    setIsRecording(false);
    setDuration(0);
  };

  // Auto start on mount logic
  useEffect(() => {
    let mounted = true;

    const initRecording = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
        });

        if (!mounted) {
          // Component unmounted while waiting for permission
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        streamRef.current = stream;
        const mediaRecorder = new MediaRecorder(stream);
        mediaRecorderRef.current = mediaRecorder;
        chunksRef.current = [];

        mediaRecorder.ondataavailable = (e) => {
          if (e.data.size > 0) chunksRef.current.push(e.data);
        };

        mediaRecorder.start();

        // Only set state if still mounted
        if (mounted) {
          setIsRecording(true);
          setDuration(0);
          timerRef.current = setInterval(() => {
            if (mounted) setDuration((prev) => prev + 1);
          }, 1000);
        }
      } catch (err) {
        console.error("Error accessing microphone:", err);
        if (mounted) {
          alert(
            "Không thể truy cập microphone. Vui lòng kiểm tra quyền truy cập.",
          );
          onCancel();
        }
      }
    };

    initRecording();

    return () => {
      mounted = false;
      cleanup();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Run once on mount

  // Dừng ghi âm và gửi
  const stopRecording = () => {
    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state !== "inactive"
    ) {
      mediaRecorderRef.current.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        // Zalo thường chấp nhận webm container nếu extension là audio
        const file = new File([blob], `voice_msg_${Date.now()}.mp3`, {
          type: "audio/mp3",
        });
        onSend(file);
      };
      mediaRecorderRef.current.stop();
      cleanup(); // Stop timer & tracks immediately
    }
  };

  const cancelRecording = () => {
    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state !== "inactive"
    ) {
      mediaRecorderRef.current.stop();
    }
    cleanup();
    onCancel();
  };

  const formatTime = (seconds: number) => {
    const min = Math.floor(seconds / 60);
    const sec = seconds % 60;
    return `${min}:${sec < 10 ? "0" : ""}${sec}`;
  };

  return (
    <div className="flex items-center gap-4 bg-gray-100 dark:bg-gray-800 p-2 rounded-full w-full animate-in slide-in-from-bottom-2 fade-in duration-300">
      <div className="w-3 h-3 rounded-full bg-red-500 animate-pulse ml-2" />
      <span className="text-sm font-mono text-gray-700 dark:text-gray-300 min-w-[50px]">
        {formatTime(duration)}
      </span>
      <span className="text-xs text-gray-500 flex-1">Đang ghi âm...</span>

      <button
        onClick={cancelRecording}
        className="p-2 text-gray-500 hover:text-red-500 transition-colors"
        title="Hủy"
      >
        <Icons.Close className="w-5 h-5" />
      </button>

      <button
        onClick={stopRecording}
        disabled={disabled}
        className="p-2 bg-blue-600 text-white rounded-full hover:bg-blue-700 transition-colors shadow-md"
        title="Gửi"
      >
        <Icons.Send className="w-5 h-5" />
      </button>
    </div>
  );
}
