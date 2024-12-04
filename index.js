const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const bodyParser = require('body-parser');
const cron = require('node-cron');
const fs = require('fs');
const path = require('path');


// App setup
const app = express();
const server = http.createServer(app);
const io = new Server(server);
app.use(bodyParser.json());

let events = []; // In-memory event storage

// Endpoint: Add Event for post
app.post('/events', (req, res) => {
  const { title, description, time } = req.body;
  if (!title || !description || !time) {
    return res.status(400).json({ message: 'All fields are required: title, description, time' });
  }

  const newEvent = {
    eventId: `event-${Date.now()}`,
    title,
    description,
    time: new Date(time).toISOString(),
  };

  // Check for overlaps
  const overlappingEvents = events.filter(
    (event) =>
      Math.abs(new Date(event.time) - new Date(newEvent.time)) < 5 * 60 * 1000 // 5-minute overlap
  );

  if (overlappingEvents.length > 0) {
    io.emit('overlap', {
      message: 'Event overlap detected',
      overlappingEvents,
    });
  }

  events.push(newEvent);
  res.status(201).json({ message: 'Event created successfully', eventId: newEvent.eventId });
});

// Endpoint: Get Events
app.get('/events', (req, res) => {
  const now = new Date().toISOString();
  const upcomingEvents = events.filter((event) => new Date(event.time) > new Date(now));
  res.status(200).json(upcomingEvents);
});

// Real-time Notifications
io.on('connection', (socket) => {
  console.log('A user connected');
  socket.on('disconnect', () => {
    console.log('A user disconnected');
  });
});

// Cron Job: Notify 5 minutes before event
cron.schedule('* * * * *', () => {
  const now = new Date();
  events.forEach((event) => {
    const eventTime = new Date(event.time);
    const timeDiff = eventTime - now;

    if (timeDiff > 0 && timeDiff <= 5 * 60 * 1000) {
      io.emit('notify', {
        message: `Event "${event.title}" is starting soon`,
        event,
      });
    }
  });
});

// Log Completed Events
cron.schedule('* * * * *', () => {
  const now = new Date();
  const completedEvents = events.filter((event) => new Date(event.time) < now);

  completedEvents.forEach((event) => {
    const logPath = path.join(__dirname, 'event_logs.json');
    const logEntry = {
      eventId: event.eventId,
      title: event.title,
      description: event.description,
      completedTime: new Date().toISOString(),
    };

    // Append to log file
    fs.appendFile(logPath, JSON.stringify(logEntry) + '\n', (err) => {
      if (err) {
        console.error('Failed to log event:', err);
      }
    });
  });

  // Remove completed events from memory
  events = events.filter((event) => new Date(event.time) >= now);
});

// Start Server
const PORT = 3000;
server.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
