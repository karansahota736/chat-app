import React from "react";
import { ArrowLeft, Phone, Video } from "lucide-react";

 
export default function ChatHeader({ chat, onBack, onVoiceCall, onVideoCall }) {
  return (
    <div className="flex items-center justify-between p-4 border-b bg-white">
      <div className="flex items-center gap-3">
        {/* Mobile back button */}
        <button onClick={onBack} className="md:hidden">
          <ArrowLeft className="w-5 h-5 text-gray-700" />
        </button>
        <div className="w-10 h-10 bg-gray-300 rounded-full"></div>
        <div>
          <div className="font-medium">{chat.name}</div>
          <div className="text-xs text-green-500">Online</div>
        </div>
      </div>

      {/* Call buttons */}
      <div className="flex items-center gap-2">
        <button
          onClick={onVoiceCall}
          className="p-2 rounded-full hover:bg-gray-100 transition"
          title="Voice Call"
        >
          <Phone className="w-5 h-5 text-gray-700" />
        </button>
        <button
          onClick={onVideoCall}
          className="p-2 rounded-full hover:bg-gray-100 transition"
          title="Video Call"
        >
          <Video className="w-5 h-5 text-gray-700" />
        </button>
      </div>
    </div>
  );
}
