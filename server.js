if (process.env.NODE_ENV !== "production") {
    require("dotenv").config();
}
let db;
const userFriends = {};
const users = {};
let friends = [];
let messages = {};
let peerConnection;
let name = "";
const path = require("path");
const bcrypt = require("bcrypt");
const passport = require("passport");
const LocalStrategy = require('passport-local').Strategy;
const flash = require("express-flash");
const session = require("express-session");
const mongoose = require('mongoose');
const { body, validationResult } = require('express-validator');
const User = require('./models/User');
const nodemailer = require('nodemailer');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const fs = require('fs');
const MongoStore = require('connect-mongo');
const https = require('https')
const express = require('express');
const app = express();
const socketio = require('socket.io');
const rooms = {};
const router = express.Router();
const cookieParser = require('cookie-parser');
app.use(express.static(__dirname))
const ObjectId = require('mongoose').Types.ObjectId;
const { v4: uuidV4 } = require('uuid');
//we need a key and cert to run https
//we generated them with mkcert
// $ mkcert create-ca
// $ mkcert create-cert

let connectedClients = 0;
//we changed our express setup so we can use https
//pass the key and cert to createServer on https

// Create our socket.io server
const PendingUser = require('./models/PendingUser');
//create our socket.io server... it will listen to our express port
const expressServer = app.listen(process.env.PORT || 3000, () => {
    console.log(`Server running on port ${process.env.PORT || 3000}`);
});
// Create our socket.io server

//create our socket.io server... it will listen to our express port
const io = socketio(expressServer,{
    cors: {
        origin: [
            "https://localhost",
             'https://r3dxx-9ce6f110c87b.herokuapp.com' //if using a phone or another computer
        ],
        methods: ["GET", "POST"]
    }
});

//offers will contain {}
let offers = [

];
let connectedSockets = [
    
]
const connectedUsers = {};
io.on('connection',(socket)=>{
  
    console.log('Socket connected:', socket.id);
    console.log("hey buddy")
    connectedClients++;
    // console.log("Someone has connected");
    const userName = socket.handshake.auth.userName;
    const password = socket.handshake.auth.password;

    if(password !== "x"){
        socket.disconnect(true);
        return;
    }



  
    
  

    const userEmail = socket.handshake.auth.userEmail;
    console.log(userEmail)
    connectedSockets.push({
        socketId: socket.id,
        userEmail
    })

    //a new client has joined. If there are any offers available,
    //emit them out
    if(offers.length){
        socket.emit('availableOffers',offers);
    }
    socket.on('message1', (messageData) => {
        console.log('Message received:', messageData);
        // Broadcast the message to all connected clients
        socket.broadcast.emit('message1', messageData);
    });
    socket.on('newOffer',newOffer=>{
        offers.push({
            offererUserName: userEmail,
            offer: newOffer,
            offerIceCandidates: [],
            answererUserName: null,
            answer: null,
            answererIceCandidates: []
        })
        // console.log(newOffer.sdp.slice(50))
        //send out to all connected sockets EXCEPT the caller
        socket.broadcast.emit('newOfferAwaiting',offers.slice(-1))
    })

    socket.on('newAnswer',(offerObj,ackFunction)=>{
        console.log(offerObj);
        console.log(userEmail)
        //emit this answer (offerObj) back to CLIENT1
        //in order to do that, we need CLIENT1's socketid
        const socketToAnswer = connectedSockets.find(s=>s.userEmail === offerObj.offererUserName)
        if(!socketToAnswer){
            console.log("No matching socket")
            return;
        }
        //we found the matching socket, so we can emit to it!
        const socketIdToAnswer = socketToAnswer.socketId;
        //we find the offer to update so we can emit it
        const offerToUpdate = offers.find(o=>o.offererUserName === offerObj.offererUserName)
        if(!offerToUpdate){
            console.log("No OfferToUpdate")
            return;
        }
        //send back to the answerer all the iceCandidates we have already collected
        ackFunction(offerToUpdate.offerIceCandidates);
        offerToUpdate.answer = offerObj.answer
        offerToUpdate.answererUserName = userEmail
        //socket has a .to() which allows emiting to a "room"
        //every socket has it's own room
        socket.to(socketIdToAnswer).emit('answerResponse',offerToUpdate)
    })

    socket.on('sendIceCandidateToSignalingServer',iceCandidateObj=>{
        const { didIOffer, iceUserName, iceCandidate } = iceCandidateObj;
        // console.log(iceCandidate);
        if(didIOffer){
            //this ice is coming from the offerer. Send to the answerer
            const offerInOffers = offers.find(o=>o.offererUserName === iceUserName);
            if(offerInOffers){
                offerInOffers.offerIceCandidates.push(iceCandidate)
                // 1. When the answerer answers, all existing ice candidates are sent
                // 2. Any candidates that come in after the offer has been answered, will be passed through
                if(offerInOffers.answererUserName){
                    //pass it through to the other socket
                    const socketToSendTo = connectedSockets.find(s=>s.userEmail === offerInOffers.answererUserName);
                    if(socketToSendTo){
                        socket.to(socketToSendTo.socketId).emit('receivedIceCandidateFromServer',iceCandidate)
                    }else{
                        console.log("Ice candidate recieved but could not find answere")
                    }
                }
            }
        }else{
            //this ice is coming from the answerer. Send to the offerer
            //pass it through to the other socket
            const offerInOffers = offers.find(o=>o.answererUserName === iceUserName);
            const socketToSendTo = connectedSockets.find(s=>s.userEmail === offerInOffers.offererUserName);
            if(socketToSendTo){
                socket.to(socketToSendTo.socketId).emit('receivedIceCandidateFromServer',iceCandidate)
            }else{
                console.log("Ice candidate recieved but could not find offerer")
            }
        }
        // console.log(offers)
    })

    // Handle disconnection
    socket.on('disconnect', () => {
        console.log('A user disconnected:', socket.id);

        // Remove the user's socket from connectedSockets
        connectedSockets = connectedSockets.filter(s => s.socketId !== socket.id);

        // Remove offers associated with the disconnected user
        offers = offers.filter(offer => offer.offererUserName !== userEmail && offer.answererUserName !== userEmail);
        
        // Optionally notify other users or clean up UI here if needed
    });
    

   


})

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: false }));
app.use(express.json());
app.use(require('cookie-parser')());
app.set('view engine', 'ejs');
app.use(cookieParser());
app.use(session({
    secret: 'yourSecretKey', // Replace with a secure, randomly generated string in production
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({ mongoUrl: 'mongodb+srv://kingcod163:Saggytits101@cluster0.rcyom.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0' }) // Ensure this points to your MongoDB instance
}));

// Nodemailer transporter setup
const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: {
        user: 'pantsbro4@gmail.com', // Replace with your email
        pass: 'tpxy ymac aupu ktow'   // Replace with your password
    },
    tls: {
        rejectUnauthorized: false
    }
});

// Initialize Passport
function initialize(passport) {
    const authenticateUser = async (email, password, done) => {
        try {
            const user = await User.findOne({ email });
            if (!user) {
                return done(null, false, { message: 'No user with that email' });
            }
            if (await bcrypt.compare(password, user.password)) {
                return done(null, user); // Pass the whole user object
            } else {
                return done(null, false, { message: 'Password incorrect' });
            }
        } catch (e) {
            return done(e);
        }
    };

    passport.use(new LocalStrategy({ usernameField: 'email' }, authenticateUser));
    
    passport.serializeUser((user, done) => {
        done(null, user.id); // Serialize by user ID
    });

    passport.deserializeUser(async (id, done) => {
        try {
            const user = await User.findById(id);
            done(null, user); // Pass the entire user object
        } catch (err) {
            done(err, null);
        }
    });
}

initialize(passport);

// MongoDB connection
mongoose.connect('mongodb+srv://kingcod163:Saggytits101@cluster0.rcyom.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0', {
    serverSelectionTimeoutMS: 30000
    
})

.then(() => console.log('Connected to MongoDB'))
.catch(err => console.error('MongoDB connection error:', err));
app.use('/api', router);
app.use(flash());
app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false
}));
app.use(passport.initialize());
app.use(passport.session());

// Authentication middleware
function checkAuthenticated(req, res, next) {
    if (req.isAuthenticated()) {
        return next();
    }
    res.redirect('/login');
}
async function getUserByEmail(email) {
    console.log('hasfhjba ' , email)
    try {
        return await User.findOne({ email }).populate('friends'); // Populate friends if needed
    } catch (error) {
        console.error(`Error fetching user by email: ${email}`, error);
        return null; // Return null in case of error
    }


    
}
function checkNotAuthenticated(req, res, next) {
    if (req.isAuthenticated()) {
        return res.redirect('/home');
    }
    next();
}

// Register route
app.post("/register", [
    body('username').notEmpty().withMessage('Username is required'),
    body('email').isEmail().withMessage('Enter a valid email'),
    body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters long')
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    try {
        const existingUser = await User.findOne({ email: req.body.email });
        if (existingUser) {
            return res.status(400).json({ error: 'Email already exists' });
        }

        const hashedPassword = await bcrypt.hash(req.body.password, 10);
        const token = jwt.sign({ email: req.body.email }, process.env.JWT_SECRET, { expiresIn: '1h' });

        const pendingUser = new PendingUser({
            username: req.body.username,
            email: req.body.email,
            password: hashedPassword,
            token
        });

        await pendingUser.save();

        const url = `${process.env.session_url}/confirmation/${token}`;

        await transporter.sendMail({
            to: pendingUser.email,
            subject: 'Confirm Email',
            html: `Click <a href="${url}">here</a> to confirm your email.`,
        });

        res.status(201).send('User registered. Please check your email to confirm.');
    } catch (e) {
        console.log(e);
        res.status(500).send('Server error');
    }
});
const messageSchema = new mongoose.Schema({
    sender: String,
    recipient: String,
    message: String,
    timestamp: { type: Date, default: Date.now }
});

const Message = mongoose.model('Message', messageSchema);
// Email confirmation
app.get('/confirmation/:token', async (req, res) => {
    try {
        const token = req.params.token;
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const pendingUser = await PendingUser.findOne({ email: decoded.email, token });

        if (!pendingUser) {
            return res.status(400).send('Invalid token or user does not exist');
        }

        const newUser = new User({
            name: pendingUser.username,
            email: pendingUser.email,
            password: pendingUser.password,
            isConfirmed: true
        });

        await newUser.save();
        await PendingUser.deleteOne({ email: pendingUser.email });

        res.send('Email confirmed. You can now log in.');
    } catch (e) {
        console.log(e);
        res.status(500).send('Server error');
    }
});

// Login route
app.get('/login', checkNotAuthenticated, (req, res) => {
    res.render("login.ejs");
});



// Route for handling user login
app.post("/login", async (req, res, next) => {
    passport.authenticate('local', async (err, user, info) => {
        if (err) {
            return next(err);
        }
        if (!user) {
            return res.redirect('/login');
        }
        req.logIn(user, async (err) => {
            if (err) {
                return next(err);
            }

            const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
            req.session.verificationCode = verificationCode;

            await transporter.sendMail({
                to: user.email,
                subject: 'Your Verification Code',
                html: `<p>Your verification code is: <strong>${verificationCode}</strong></p>`,
            });

            // Set a secure cookie
            res.cookie('user', user.username, { maxAge: 900000000, httpOnly: true, secure: true });

            // Redirect to the verification page after login
            req.session.userEmail1 = req.body.email;
            return res.redirect('/verify');
        });
    })(req, res, next);
});



// Verification route
app.get('/verify', (req, res) => {
    res.render('verify.ejs'); // Render your verification form here
});

// Handle verification code submission
app.post('/verify', (req, res) => {
    const { code } = req.body;

    // Check if the verification code is valid
    if (code === req.session.verificationCode) {
        // On successful verification, redirect to insighta.html
        const userEmail = req.session.userEmail;
        return res.redirect('/insighta.html');
        
    } else {
        res.send('Invalid verification code. Please try again.');
    }
});

app.get('/insighta.html', checkAuthenticated, (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'insighta.html'));
});

// Redirect root to a new room
app.get('/', (req, res) => {
    if (req.isAuthenticated()) {
        res.sendFile(path.join(__dirname, 'views', 'insighta.html'));
    } else {
        res.redirect('/login');
    }
});

app.post('/redirect', (req, res) => {
    res.redirect('/register');
});

// User search route
app.get('/search', async (req, res) => {
    const { name } = req.query;
    try {
        const users = await User.find({ name: new RegExp(name, 'i') }); // Case-insensitive search
        res.json(users);
    } catch (error) {
        res.status(500).send('Error searching users');
    }
});

app.post('/redirect1', (req, res) => {
    res.redirect('/login');
});

// Room route
app.get('/:room.html', (req, res) => {
    res.render('index', { roomId: req.params.room });
});

// Registration route
app.get('/register', checkNotAuthenticated, (req, res) => {
    res.render("register.ejs");
});

 

app.post('/add-friend', checkAuthenticated, async (req, res) => {
    const { friendEmail } = req.body;

    // Validate input
    if (!friendEmail) {
        return res.status(400).send('Friend email is required.');
    }

    try {
        const user = await User.findById(req.user.id);
        if (!user) {
            return res.status(404).send('User not found.');
        }

        const friend = await User.findOne({ email: friendEmail });
        if (!friend) {
            return res.status(404).send('Friend not found.');
        }

        if (user.friends.includes(friend.id)) {
            return res.status(400).send('You are already friends.');
        }

        // Add friend to current user's friends list
        user.friends.push(friend.id);
        await user.save(); // Ensure this only saves the current user's document

        // Optionally, add the current user to the friend's friends list
        if (!friend.friends.includes(user.id)) {
            friend.friends.push(user.id);
            await friend.save(); // This should not cause a username validation error
        }

        res.status(200).send('Friend added successfully.');
    } catch (err) {
        console.error('Error adding friend:', err);
        res.status(500).send('Server error.');
    }
});





app.get('/get-friends', async (req, res) => {
    try {
        const user = await User.findById(req.user.id).populate('friends'); // Assuming friends are referenced by ObjectId
        if (!user) {
            return res.status(404).send('User not found.');
        }

        // Return friends list
        res.status(200).json(user.friends);
    } catch (err) {
        console.error(err);
        res.status(500).send('Server error.');
    }
});

app.post('/send-message', checkAuthenticated, async (req, res) => {
    const { recipient, message } = req.body;

    // Input validation
    if (!recipient || !message) {
        return res.status(400).json({ message: 'Recipient and message are required.' });
    }

    const newMessage = new Message({
        sender: req.user.email,
        recipient,
        message
    });

    try {
        await newMessage.save();

        const recipientSocketId = users[recipient]; // This should now work
        if (recipientSocketId) {
            io.to(recipientSocketId).emit('message1', {
                sender: req.user.email,
                recipient,
                message
            });
        }

        res.status(200).json({ message: 'Message sent successfully!' });
    } catch (error) {
        console.error('Error sending message:', error);
        res.status(500).json({ message: 'Failed to send message' });
    }
});
// Get Messages Route
app.get('/get-messages', async (req, res) => {
    const { friend, lastMessageId } = req.query;

    // Find messages that are either sent or received by the user
    const query = {
        $or: [
            { sender: req.user.email, recipient: friend },
            { sender: friend, recipient: req.user.email }
        ]
    };

    // If lastMessageId is provided, filter for messages that are newer
    if (lastMessageId) {
        query._id = { $gt: lastMessageId }; // Use ObjectId for MongoDB
    }

    const messages = await Message.find(query).sort({ timestamp: 1 });

    res.json(messages);
});

app.post('/logout', (req, res) => {
    req.logout((err) => {
        if (err) {
            return res.status(500).json({ message: 'Failed to log out' });
        }
        req.session.destroy((err) => {
            if (err) {
                return res.status(500).json({ message: 'Failed to destroy session' });
            }
            res.clearCookie('connect.sid'); // Clear the session cookie
            res.status(200).json({ message: 'Logged out successfully' });
        });
    });
});

app.get('/get-email', async (req, res) => {
    const { userId } = req.query; // Assuming you pass userId as a query param
    try {
        const user = await User.findById(userId);
        if (user) {
            res.json({ email: user.email });
        } else {
            res.status(404).send('User not found');
        }
    } catch (error) {
        res.status(500).send('Server error');
    }
});

app.get('/api/user/email', checkAuthenticated, async (req, res) => {
    console.log('User in request:', req.user); // Log the user object
    try {
        if (!req.user) {
            return res.status(400).json({ message: 'User not authenticated' });
        }
        
        const userId = req.user._id; // Get the user's ID
        const user = await User.findById(userId).select('email');
        
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }
        
        res.status(200).json({ email: user.email });
    } catch (error) {
        console.error('Error retrieving user email:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});
  
  module.exports = router;
