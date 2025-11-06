// src/pages/Chat.jsx
import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { io } from "socket.io-client";
import Sidebar from "../components/Sidebar";
import ChatHeader from "../components/ChatHeader";
import ChatMessages from "../components/ChatMessages";
import MessageInput from "../components/MessageInput";

const API_BASE = process.env.REACT_APP_API_URL || "http://localhost:3001";

export default function Chat() {
  const [selectedChat, setSelectedChat] = useState(null);
  const [messages, setMessages] = useState([]);
  const [showSidebar, setShowSidebar] = useState(true);

  // call UI
  const [inCall, setInCall] = useState(false);
  const [incoming, setIncoming] = useState(null); // { fromUserId, mediaType, offer }
  const [callMediaType, setCallMediaType] = useState("audio"); // "audio" | "video"

  const navigate = useNavigate();

  const socketRef = useRef(null);
  const pcRef = useRef(null);
  const localStreamRef = useRef(null);
  const remoteStreamRef = useRef(null);

  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);

  const currentUser = JSON.parse(localStorage.getItem("user"));

  // STUN (add TURN in production)
  const rtcConfig = {
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
  };

  useEffect(() => {
    if (!currentUser) navigate("/");
  }, [navigate, currentUser]);

  useEffect(() => {
    if (!currentUser) return;

    socketRef.current = io(API_BASE, {
      transports: ["websocket"],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 2000,
    });

    socketRef.current.on("connect", () => {
      console.log("🔌 Connected:", socketRef.current.id);
      socketRef.current.emit("userConnected", currentUser.id);
    });

    // Messaging
    socketRef.current.on("receiveMessage", (message) => {
      const messageWithFromMe = {
        ...message,
        fromMe: message.senderId === currentUser.id,
      };
      if (
        selectedChat &&
        (message.senderId === selectedChat.id ||
          message.receiverId === selectedChat.id)
      ) {
        setMessages((prev) => [...prev, messageWithFromMe]);
      }
    });

    // Calls — receiving offer
    socketRef.current.on("receive-call", async ({ fromUserId, offer, mediaType }) => {
      setIncoming({ fromUserId, offer, mediaType });
    });

    // Calls — remote answer received
    socketRef.current.on("call-answered", async ({ answer }) => {
      if (!pcRef.current) return;
      await pcRef.current.setRemoteDescription(new RTCSessionDescription(answer));
      setInCall(true);
    });

    // Calls — ICE from remote
    socketRef.current.on("ice-candidate", ({ candidate }) => {
      if (pcRef.current && candidate) {
        pcRef.current.addIceCandidate(new RTCIceCandidate(candidate)).catch(console.error);
      }
    });

    // Calls — rejected / ended
    socketRef.current.on("call-rejected", ({ reason }) => {
      console.log("Call rejected:", reason);
      cleanupPeer();
      setInCall(false);
      setIncoming(null);
      alert(`Call rejected: ${reason || "rejected"}`);
    });

    socketRef.current.on("call-ended", () => {
      console.log("Peer ended the call");
      endCallLocal("Peer ended the call");
    });

    return () => {
      socketRef.current?.disconnect();
      cleanupPeer(true);
    };
  }, [selectedChat, currentUser]);

  // Fetch chat history
  const fetchChatHistory = async (chatUserId) => {
    if (!currentUser || !chatUserId) return [];
    try {
      const res = await fetch(`${API_BASE}/api/messages/${currentUser.id}/${chatUserId}`, {
        headers: {
          Accept: "application/json",
          "ngrok-skip-browser-warning": "true",
        },
      });
      if (!res.ok) throw new Error("Failed to fetch messages");
      const data = await res.json();
      return data.map((msg) => ({
        ...msg,
        fromMe: msg.sender_id === currentUser.id,
        text: msg.message || "",
        time:
          msg.time ||
          (msg.created_at ? new Date(msg.created_at).toLocaleTimeString() : ""),
      }));
    } catch (e) {
      console.error("Error fetching messages:", e);
      return [];
    }
  };

  const handleSelectChat = async (chat) => {
    setSelectedChat(chat);
    setShowSidebar(false);
    const oldMessages = await fetchChatHistory(chat.id);
    setMessages(oldMessages);
  };

  const generateChatId = (a, b) => [a, b].sort().join("_");

  // Send text / templated payloads
  const handleSend = (payload) => {
    if (!selectedChat) return;

    const chatId = generateChatId(currentUser.id, selectedChat.id);
    const base = {
      chatId,
      time: new Date().toLocaleTimeString(),
      senderId: currentUser.id,
      receiverId: selectedChat.id,
      fromMe: true,
    };

    const msg =
      typeof payload === "string"
        ? { ...base, text: payload, type: "text" }
        : {
            ...base,
            text: payload.text ?? null,
            type: payload.type ?? "text",
            mediaUrl: payload.mediaUrl ?? null,
            subtype: payload.subtype ?? null,
            url: payload.url ?? null,
            phoneNumber: payload.phoneNumber ?? null,
          };

    socketRef.current.emit("sendMessage", msg);
    setMessages((prev) => [...prev, msg]);
  };

  // Send media (fixed upload contract)
  const handleMediaSend = async ({ files, text }) => {
    if (!selectedChat || !files || !files.length) return;

    const chatId = generateChatId(currentUser.id, selectedChat.id);
    const mediaUrls = [];

    for (const file of files) {
      const formData = new FormData();
      formData.append("media", file);
      try {
        const res = await fetch(`${API_BASE}/api/upload`, {
          method: "POST",
          body: formData,
        });
        const data = await res.json();
        if (data?.success && data?.fileUrl) mediaUrls.push(data.fileUrl);
      } catch (e) {
        console.error("Upload failed:", e);
      }
    }

    const message = {
      fromMe: true,
      chatId,
      senderId: currentUser.id,
      receiverId: selectedChat.id,
      time: new Date().toLocaleTimeString(),
      type: "media",
      text: text || "",
      mediaUrl: mediaUrls.length === 1 ? mediaUrls[0] : null,
      // If you need multiple, store as JSON string in DB or a related table
    };

    socketRef.current.emit("sendMessage", message);
    setMessages((prev) => [...prev, message]);
  };

  // ===== Calls =====
  const createPeer = (toUserId) => {
    const pc = new RTCPeerConnection(rtcConfig);

    // Remote stream container
    remoteStreamRef.current = new MediaStream();
    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = remoteStreamRef.current;
    }

    // Forward all local tracks
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => pc.addTrack(t, localStreamRef.current));
    }

    // Receive remote tracks
    pc.ontrack = (event) => {
      event.streams[0].getTracks().forEach((track) => {
        remoteStreamRef.current.addTrack(track);
      });
    };

    // ICE
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socketRef.current.emit("ice-candidate", {
          toUserId,
          candidate: event.candidate,
        });
      }
    };

    // Connection state
    pc.onconnectionstatechange = () => {
      const st = pc.connectionState;
      if (st === "failed" || st === "disconnected" || st === "closed") {
        endCallLocal(`Connection ${st}`);
      }
    };

    return pc;
  };

  // Start outgoing call
  const startCall = async (withVideo) => {
    if (!selectedChat || !currentUser) return;

    try {
      const constraints = withVideo ? { video: true, audio: true } : { audio: true };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      localStreamRef.current = stream;
      setCallMediaType(withVideo ? "video" : "audio");

      if (localVideoRef.current) localVideoRef.current.srcObject = stream;

      pcRef.current = createPeer(selectedChat.id);

      const offer = await pcRef.current.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: withVideo,
      });
      await pcRef.current.setLocalDescription(offer);

      socketRef.current.emit("call-user", {
        toUserId: selectedChat.id,
        fromUserId: currentUser.id,
        offer,
        mediaType: withVideo ? "video" : "audio",
      });

      // Show call UI
      setInCall(true);
    } catch (e) {
      console.error("startCall error:", e);
      alert("Could not access camera/microphone.");
    }
  };

  const handleVoiceCall = async () => startCall(false);
  const handleVideoCall = async () => startCall(true);

  // Accept incoming call
  const acceptCall = async () => {
    if (!incoming) return;
    const { fromUserId, offer, mediaType } = incoming;
    setIncoming(null);
    setCallMediaType(mediaType || "video");

    try {
      const constraints = mediaType === "video" ? { video: true, audio: true } : { audio: true };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      localStreamRef.current = stream;
      if (localVideoRef.current) localVideoRef.current.srcObject = stream;

      pcRef.current = createPeer(fromUserId);
      await pcRef.current.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await pcRef.current.createAnswer();
      await pcRef.current.setLocalDescription(answer);

      socketRef.current.emit("answer-call", {
        toUserId: fromUserId,
        answer,
      });

      setInCall(true);
    } catch (e) {
      console.error("acceptCall error:", e);
      alert("Failed to accept call.");
    }
  };

  const rejectCall = () => {
    if (incoming?.fromUserId) {
      socketRef.current.emit("reject-call", {
        toUserId: incoming.fromUserId,
        reason: "busy",
      });
    }
    setIncoming(null);
  };

  // End call (inform peer)
  const endCall = () => {
    const peerId =
      incoming?.fromUserId || selectedChat?.id || null;
    if (peerId) socketRef.current.emit("end-call", { toUserId: peerId });
    endCallLocal("You ended the call");
  };

  const endCallLocal = (msg) => {
    if (msg) console.log(msg);
    setInCall(false);
    cleanupPeer();
  };

  const cleanupPeer = (stopLocal = false) => {
    try {
      if (pcRef.current) {
        pcRef.current.ontrack = null;
        pcRef.current.onicecandidate = null;
        pcRef.current.onconnectionstatechange = null;
        pcRef.current.getSenders?.().forEach((s) => {
          try {
            s.track?.stop();
          } catch {}
        });
        pcRef.current.close();
      }
    } catch {}
    pcRef.current = null;

    if (stopLocal && localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
    }

    if (remoteStreamRef.current) {
      remoteStreamRef.current.getTracks().forEach((t) => t.stop());
      remoteStreamRef.current = null;
    }

    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
    if (localVideoRef.current && !inCall) localVideoRef.current.srcObject = null;
  };

  // Simple toggles
  const toggleMute = () => {
    localStreamRef.current?.getAudioTracks().forEach((t) => (t.enabled = !t.enabled));
  };
  const toggleCamera = () => {
    localStreamRef.current?.getVideoTracks().forEach((t) => (t.enabled = !t.enabled));
  };

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <div className={`w-full md:w-1/3 lg:w-1/4 ${showSidebar ? "block" : "hidden"} md:block`}>
        <Sidebar onSelectChat={handleSelectChat} />
      </div>

      {/* Chat Window */}
      <div className={`flex-1 flex flex-col w-full ${!showSidebar ? "flex" : "hidden"} md:flex`}>
        {selectedChat ? (
          <>
            <ChatHeader
              chat={selectedChat}
              onBack={() => setShowSidebar(true)}
              onVoiceCall={handleVoiceCall}
              onVideoCall={handleVideoCall}
            />

            <div className="flex-1 overflow-y-auto px-4 py-2 bg-gray-100">
              <ChatMessages messages={messages} />
            </div>

            <div className="border-t p-2 bg-white">
              <MessageInput onSend={handleSend} onMediaSend={handleMediaSend} />
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-500">
            Select a chat to start messaging
          </div>
        )}
      </div>

      {/* Incoming call modal */}
      {incoming && !inCall && (
        <div className="fixed top-1/4 left-1/2 -translate-x-1/2 bg-white p-5 rounded-xl shadow-2xl z-50">
          <h3 className="text-lg font-semibold mb-2">
            Incoming {incoming.mediaType === "audio" ? "Voice" : "Video"} Call
          </h3>
          <div className="text-sm mb-4">From user #{incoming.fromUserId}</div>
          <div className="flex gap-3">
            <button className="px-4 py-2 bg-green-600 text-white rounded" onClick={acceptCall}>
              Accept
            </button>
            <button className="px-4 py-2 bg-red-600 text-white rounded" onClick={rejectCall}>
              Reject
            </button>
          </div>
        </div>
      )}

      {/* Call overlay */}
      {inCall && (
        <div className="fixed bottom-4 right-4 w-[380px] bg-white rounded-xl shadow-2xl p-3 z-40">
          <div className="text-sm font-semibold mb-2">
            {callMediaType === "audio" ? "Voice Call" : "Video Call"}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-black rounded overflow-hidden">
              <video ref={localVideoRef} autoPlay playsInline muted style={{ width: "100%", height: 160 }} />
            </div>
            <div className="bg-black rounded overflow-hidden">
              <video ref={remoteVideoRef} autoPlay playsInline style={{ width: "100%", height: 160 }} />
            </div>
          </div>
          <div className="flex gap-2 mt-3">
            <button className="px-3 py-2 border rounded" onClick={toggleMute}>Toggle Mute</button>
            {callMediaType === "video" && (
              <button className="px-3 py-2 border rounded" onClick={toggleCamera}>Toggle Camera</button>
            )}
            <button className="px-3 py-2 rounded bg-red-600 text-white ml-auto" onClick={endCall}>
              End
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
