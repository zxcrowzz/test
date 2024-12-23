const userName = "Pantsbro"+Math.floor(Math.random() * 100000)
const password = "x";
const userId = "YOUR_USER_ID";
let isInCall = false; 
//if trying it on a phone, use this instead...
const socket = io.connect('https://10.0.0.66:8181/',{
    //const socket = io.connect('https://localhost:8181/',{
        auth: {
            userName,password
        }
    })
    window.socket = socket; // Assign socket to a global variable

    // Call to set up socket listeners
    initSocketListeners();
let currentRoom = null;


let peerConfiguration = {
    iceServers: [
        {
            urls: [
                'stun:stun.l.google.com:19302',
                'stun:stun1.l.google.com:19302'
            ]
        },
        {
            urls: 'turn:relay1.expressturn.com:3478',
            username: 'ef0645F7PFI1NDP4KH', // Replace with your TURN server username
            credential: 'BNeVubliu1aMKEpN' // Replace with your TURN server credential
        }
    ]
};


//when a client initiates a call
const call = async e => {
    await fetchUserMedia();
    await createPeerConnection();

    try {
        console.log("Creating offer...");
        const offer = await peerConnection.createOffer();
        console.log(offer);
        await peerConnection.setLocalDescription(offer);
        didIOffer = true;

        socket.emit('newOffer', {
            offer,
            room: currentRoom, // Include the room information
            offererUserName: userName
        });
    } catch (err) {
        console.log(err);
    }
};

const answerOffer = async(offerObj)=>{
    isInCall = true
    await fetchUserMedia()
    await createPeerConnection(offerObj);
    const answer = await peerConnection.createAnswer({}); //just to make the docs happy
    await peerConnection.setLocalDescription(answer); //this is CLIENT2, and CLIENT2 uses the answer as the localDesc
    console.log(offerObj)
    console.log(answer)
    // console.log(peerConnection.signalingState) //should be have-local-pranswer because CLIENT2 has set its local desc to it's answer (but it won't be)
    //add the answer to the offerObj so the server knows which offer this is related to
    offerObj.answer = answer 
    //emit the answer to the signaling server, so it can emit to CLIENT1
    //expect a response from the server with the already existing ICE candidates
    const offerIceCandidates = await socket.emitWithAck('newAnswer',offerObj)
    offerIceCandidates.forEach(c=>{
        peerConnection.addIceCandidate(c);
        console.log("======Added Ice Candidate======")
    })
    console.log(offerIceCandidates)
}

const addAnswer = async(offerObj)=>{
    //addAnswer is called in socketListeners when an answerResponse is emitted.
    //at this point, the offer and answer have been exchanged!
    //now CLIENT1 needs to set the remote
    await peerConnection.setRemoteDescription(offerObj.answer)
    // console.log(peerConnection.signalingState)
}

const fetchUserMedia = ()=>{
    return new Promise(async(resolve, reject)=>{
        try{
            const stream = await navigator.mediaDevices.getUserMedia({
                video: true,
                audio: true
            });
            localVideoEl.srcObject = stream;
            localVideoEl.muted = true;
            localStream = stream;    
            resolve();    
        }catch(err){
            console.log(err);
            reject()
        }
    })
}

const createPeerConnection = (offerObj)=>{
    return new Promise(async(resolve, reject)=>{
        //RTCPeerConnection is the thing that creates the connection
        //we can pass a config object, and that config object can contain stun servers
        //which will fetch us ICE candidates
        peerConnection = await new RTCPeerConnection(peerConfiguration)
        remoteStream = new MediaStream()
        remoteVideoEl.srcObject = remoteStream;


        localStream.getTracks().forEach(track=>{
            //add localtracks so that they can be sent once the connection is established
            peerConnection.addTrack(track,localStream);
        })

        peerConnection.addEventListener("signalingstatechange", (event) => {
            console.log(event);
            console.log(peerConnection.signalingState)
        });

        peerConnection.addEventListener('icecandidate',e=>{
            console.log('........Ice candidate found!......')
            console.log(e)
            if(e.candidate){
                socket.emit('sendIceCandidateToSignalingServer',{
                    iceCandidate: e.candidate,
                    iceUserName: userName,
                    didIOffer,
                })    
            }
        })
        
        peerConnection.addEventListener('track',e=>{
            console.log("Got a track from the other peer!! How excting")
            console.log(e)
            e.streams[0].getTracks().forEach(track=>{
                remoteStream.addTrack(track,remoteStream);
                console.log("Here's an exciting moment... fingers cross")
            })
        })

        if(offerObj){
            //this won't be set when called from call();
            //will be set when we call from answerOffer()
            // console.log(peerConnection.signalingState) //should be stable because no setDesc has been run yet
            await peerConnection.setRemoteDescription(offerObj.offer)
            // console.log(peerConnection.signalingState) //should be have-remote-offer, because client2 has setRemoteDesc on the offer
        }
        resolve();
    })
}


const resetClientState = () => {
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
    }
    if (peerConnection) {
        peerConnection.close();
    }
    localVideoEl.srcObject = null;
    remoteVideoEl.srcObject = null;

    // Reinitialize for new calls
    fetchUserMedia()
        .then(() => {
            initializePeerConnection();
            localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));
        })
        .catch(error => {
            console.error('Error accessing media devices.', error);
        });
};

const addNewIceCandidate = iceCandidate=>{
    peerConnection.addIceCandidate(iceCandidate)
    console.log("======Added Ice Candidate======")
}





// Function to handle the hang-up action
function hangUp() {
    resetClientState()
    if (isInCall === false) {
        console.log('No active call to hang up from.');
        return; // Exit if there’s no active call
    }
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
    }

    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }

    localVideoEl.srcObject = null;
    remoteVideoEl.srcObject = null; // Clear remote video
    console.log('Call ended');
    
    // Emit hang-up event to the signaling server
    socket.emit('hangUp');

    isInCall = false; 
};

// Listen for the hang-up event from the signaling server
socket.on('hangUp', () => {
    if (remoteVideoEl.srcObject) {
        remoteVideoEl.srcObject.getTracks().forEach(track => track.stop());
    }
    remoteVideoEl.srcObject = null; // Clear remote video
    console.log('Remote user hung up');
});



socket.on('disconnect', () => {
    resetClientState()
    console.log('You have been disconnected');
    
    // Clear local and remote streams
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
    }
    localVideoEl.srcObject = null; // Clear local video
    remoteVideoEl.srcObject = null; // Clear remote video

    // Optionally show a notification or update the UI to reflect the disconnection
});

// Add event listener to the hang-up button



const sendFriendRequest = (receiverEmail) => {
    fetch('/api/friends/send-request', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ senderId: userId, receiverEmail })
    })
    .then(response => {
        if (!response.ok) throw new Error('Failed to send friend request');
        return response.text();
    })
    .then(data => {
        console.log(data);
        socket.emit('send-request', { senderId: userId, receiverEmail });
    })
    .catch(err => console.error(err));
};

// Listen for incoming friend requests
socket.on('friend-request', (data) => {
    alert(`You have a friend request from ${data.senderId}`);
});




document.getElementById('addFriendBtn').addEventListener('click', () => {
    const friendEmail = document.getElementById('friendEmail').value;
    if (friendEmail) {
        sendFriendRequest(friendEmail);
    } else {
        alert("Please enter a friend's email.");
    }
});
