// CallComponent.jsx
// npm i socket.io-client
import React, { useRef, useEffect, useState } from "react";
// import { io } from "socket.io-client";

// const socket = io("http://localhost:5000", {
//   transports: ["websocket"], // more reliable for dev
// });

export default function CallComponent() {
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const pcRef = useRef(null);

  const [username, setUsername] = useState("");
  const [registered, setRegistered] = useState(false);

  const [targetUser, setTargetUser] = useState("");
  const [incomingCall, setIncomingCall] = useState(false);
  const [caller, setCaller] = useState("");
  const [callerOffer, setCallerOffer] = useState(null);
  const [inCall, setInCall] = useState(false);
  const [mediaType, setMediaType] = useState("video"); // "video" or "audio"

  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);

  // Always prepare camera/mic once
  useEffect(() => {
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true,
        });
        setLocalStream(stream);
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }
      } catch (err) {
        console.error("getUserMedia failed:", err);
        alert("Please allow camera/microphone.");
      }
    })();
  }, []);

  // Socket listeners
  useEffect(() => {
    function onReceiveCall({ from, offer, mediaType: mt }) {
      setIncomingCall(true);
      setCaller(from);
      setCallerOffer(offer);
      setMediaType(mt || "video");
    }

    async function onCallAnswered({ answer }) {
      if (!pcRef.current) return;
      await pcRef.current.setRemoteDescription(new RTCSessionDescription(answer));
      setInCall(true);
    }

    async function onIceCandidate({ candidate }) {
      if (!pcRef.current || !candidate) return;
      try {
        await pcRef.current.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (err) {
        console.error("Error adding received ICE candidate:", err);
      }
    }

    function onCallRejected({ reason }) {
      alert(`Call rejected: ${reason || "rejected"}`);
      cleanupPeerConnection();
    }

    function onCallEnded() {
      endCallLocal("Peer ended the call.");
    }

    socket.on("receive-call", onReceiveCall);
    socket.on("call-answered", onCallAnswered);
    socket.on("ice-candidate", onIceCandidate);
    socket.on("call-rejected", onCallRejected);
    socket.on("call-ended", onCallEnded);

    return () => {
      socket.off("receive-call", onReceiveCall);
      socket.off("call-answered", onCallAnswered);
      socket.off("ice-candidate", onIceCandidate);
      socket.off("call-rejected", onCallRejected);
      socket.off("call-ended", onCallEnded);
    };
  }, []);

  const registerUser = () => {
    if (!username.trim()) return;
    socket.emit("register", username.trim());
    setRegistered(true);
  };

  function createPeerConnection(otherUsername) {
    const pc = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
    });

    // Remote stream bucket
    const remote = new MediaStream();
    setRemoteStream(remote);
    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = remote;
    }

    // Add local tracks
    if (localStream) {
      localStream.getTracks().forEach((track) => pc.addTrack(track, localStream));
    }

    pc.ontrack = (event) => {
      // append all remote tracks
      event.streams[0].getTracks().forEach((t) => remote.addTrack(t));
    };

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit("ice-candidate", {
          to: otherUsername,
          candidate: event.candidate,
        });
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "failed" || pc.connectionState === "disconnected") {
        endCallLocal("Connection failed/disconnected.");
      }
    };

    return pc;
  }

  const callUser = async (type = "video") => {
    if (!registered) {
      alert("Register your username first.");
      return;
    }
    if (!targetUser.trim()) {
      alert("Enter a target username.");
      return;
    }

    const other = targetUser.trim();
    pcRef.current = createPeerConnection(other);

    try {
      const offer = await pcRef.current.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: type === "video",
      });
      await pcRef.current.setLocalDescription(offer);
      socket.emit("call-user", { to: other, offer, mediaType: type });
      setMediaType(type);
    } catch (err) {
      console.error("createOffer error:", err);
      alert("Could not create offer.");
    }
  };

  const acceptCall = async () => {
    if (!callerOffer) return;
    setIncomingCall(false);

    pcRef.current = createPeerConnection(caller);

    try {
      await pcRef.current.setRemoteDescription(new RTCSessionDescription(callerOffer));
      const answer = await pcRef.current.createAnswer();
      await pcRef.current.setLocalDescription(answer);

      socket.emit("answer-call", { to: caller, answer });
      setInCall(true);
    } catch (err) {
      console.error("acceptCall error:", err);
      alert("Failed to accept call.");
    }
  };

  const rejectCall = () => {
    setIncomingCall(false);
    if (caller) {
      socket.emit("reject-call", { to: caller, reason: "busy" });
    }
    setCaller("");
    setCallerOffer(null);
  };

  const endCallLocal = (msg) => {
    if (msg) console.log(msg);
    cleanupPeerConnection();
    setInCall(false);
    setCaller("");
    setCallerOffer(null);
  };

  const endCall = () => {
    // Inform the peer
    const peer = caller || targetUser;
    if (peer) socket.emit("end-call", { to: peer });
    endCallLocal("You ended the call.");
  };

  function cleanupPeerConnection() {
    try {
      if (pcRef.current) {
        pcRef.current.ontrack = null;
        pcRef.current.onicecandidate = null;
        pcRef.current.onconnectionstatechange = null;
        pcRef.current.getSenders?.().forEach((s) => {
          try { s.track?.stop(); } catch {}
        });
        pcRef.current.close();
      }
    } catch {}
    pcRef.current = null;

    // Keep local camera on (as per your original code). If you want to stop:
    // localStream?.getTracks().forEach(t => t.stop());

    if (remoteStream) {
      remoteStream.getTracks().forEach((t) => t.stop());
      setRemoteStream(null);
    }
    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = null;
    }
  }

  const toggleMute = () => {
    if (!localStream) return;
    localStream.getAudioTracks().forEach((t) => (t.enabled = !t.enabled));
  };

  const toggleCamera = () => {
    if (!localStream) return;
    localStream.getVideoTracks().forEach((t) => (t.enabled = !t.enabled));
  };

  return (
    <div style={{ maxWidth: 700, margin: "20px auto", fontFamily: "sans-serif" }}>
      <h2>WebRTC 1:1 Call (Socket.IO Signaling)</h2>

      {/* Registration */}
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <input
          placeholder="Your Username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          style={{ flex: 1, padding: 8 }}
        />
        <button onClick={registerUser} disabled={!username.trim() || registered}>
          {registered ? "Registered" : "Register"}
        </button>
      </div>

      {/* Place a call */}
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <input
          placeholder="Target Username"
          value={targetUser}
          onChange={(e) => setTargetUser(e.target.value)}
          style={{ flex: 1, padding: 8 }}
        />
        <button onClick={() => callUser("audio")}>Voice Call</button>
        <button onClick={() => callUser("video")}>Video Call</button>
      </div>

      {/* Incoming call modal */}
      {incomingCall && !inCall && (
        <div
          style={{
            background: "#fff",
            padding: 20,
            border: "1px solid #ccc",
            position: "fixed",
            top: "20%",
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 1000,
            boxShadow: "0 10px 30px rgba(0,0,0,0.1)",
          }}
        >
          <h3>Incoming {mediaType === "audio" ? "Voice" : "Video"} Call from <b>{caller}</b></h3>
          <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
            <button onClick={acceptCall}>Accept</button>
            <button onClick={rejectCall}>Reject</button>
          </div>
        </div>
      )}

      {/* Videos + Controls */}
      <div style={{ display: "flex", gap: 16, marginTop: 16 }}>
        <div style={{ flex: 1, textAlign: "center" }}>
          <div>Local</div>
          <video
            ref={localVideoRef}
            autoPlay
            muted
            playsInline
            style={{ width: "100%", maxHeight: 260, background: "#000" }}
          />
        </div>

        <div style={{ flex: 1, textAlign: "center" }}>
          <div>Remote</div>
          <video
            ref={remoteVideoRef}
            autoPlay
            playsInline
            style={{ width: "100%", maxHeight: 260, background: "#000" }}
          />
        </div>
      </div>

      {inCall && (
        <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
          <button onClick={toggleMute}>Toggle Mute</button>
          <button onClick={toggleCamera}>Toggle Camera</button>
          <button onClick={endCall} style={{ background: "#f33", color: "#fff" }}>
            End Call
          </button>
        </div>
      )}
    </div>
  );
}
