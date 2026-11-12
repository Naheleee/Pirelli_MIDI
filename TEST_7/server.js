const http = require('http');
const express = require('express');
const { Server } = require('socket.io');

const app = express();
const httpServer = http.createServer(app);
const io = new Server(httpServer);
const presenceByChannel = new Map();
const channelPattern = /^[a-zA-Z0-9._-]{1,100}$/;

app.use(express.static(__dirname));

function isValidChannel(channel) {
    return typeof channel === 'string' && channelPattern.test(channel);
}

function roomFor(channel) {
    return `channel:${channel}`;
}

function acknowledgeError(acknowledge, message) {
    if (typeof acknowledge === 'function') acknowledge({ error: message });
}

function removePresence(socket, channel) {
    const channelMembers = presenceByChannel.get(channel);
    const member = channelMembers && channelMembers.get(socket.id);
    if (!member) return;

    channelMembers.delete(socket.id);
    if (!channelMembers.size) presenceByChannel.delete(channel);
    io.to(roomFor(channel)).emit('realtime:presence', {
        channel,
        action: 'leave',
        member
    });
}

io.on('connection', socket => {
    const auth = socket.handshake.auth || {};
    const clientId = typeof auth.clientId === 'string'
        ? auth.clientId
        : socket.id;

    socket.on('realtime:subscribe', (payload, acknowledge) => {
        if (!payload || !isValidChannel(payload.channel)) {
            acknowledgeError(acknowledge, 'Invalid channel name.');
            return;
        }
        socket.join(roomFor(payload.channel));
        if (typeof acknowledge === 'function') acknowledge({ ok: true });
    });

    socket.on('realtime:publish', (payload, acknowledge) => {
        if (!payload || !isValidChannel(payload.channel) || typeof payload.event !== 'string' ||
            !channelPattern.test(payload.event)) {
            acknowledgeError(acknowledge, 'Invalid channel or event name.');
            return;
        }

        io.to(roomFor(payload.channel)).emit('realtime:message', {
            channel: payload.channel,
            event: payload.event,
            data: payload.data,
            connectionId: socket.id,
            clientId
        });
        if (typeof acknowledge === 'function') acknowledge({ ok: true });
    });

    socket.on('realtime:presence:get', (payload, acknowledge) => {
        if (!payload || !isValidChannel(payload.channel)) {
            acknowledgeError(acknowledge, 'Invalid channel name.');
            return;
        }
        const channelMembers = presenceByChannel.get(payload.channel);
        const members = channelMembers ? [...channelMembers.values()] : [];
        if (typeof acknowledge === 'function') acknowledge({ ok: true, members });
    });

    socket.on('realtime:presence:enter', (payload, acknowledge) => {
        if (!payload || !isValidChannel(payload.channel)) {
            acknowledgeError(acknowledge, 'Invalid channel name.');
            return;
        }

        const { channel, data } = payload;
        socket.join(roomFor(channel));
        let members = presenceByChannel.get(channel);
        if (!members) {
            members = new Map();
            presenceByChannel.set(channel, members);
        }

        const member = { connectionId: socket.id, clientId, data };
        const action = members.has(socket.id) ? 'update' : 'enter';
        members.set(socket.id, member);
        io.to(roomFor(channel)).emit('realtime:presence', { channel, action, member });
        if (typeof acknowledge === 'function') acknowledge({ ok: true });
    });

    socket.on('realtime:presence:leave', (payload, acknowledge) => {
        if (!payload || !isValidChannel(payload.channel)) {
            acknowledgeError(acknowledge, 'Invalid channel name.');
            return;
        }
        removePresence(socket, payload.channel);
        if (typeof acknowledge === 'function') acknowledge({ ok: true });
    });

    socket.on('disconnecting', () => {
        for (const [channel, members] of presenceByChannel) {
            if (members.has(socket.id)) removePresence(socket, channel);
        }
    });
});

const port = Number(process.env.PORT) || 3000;
httpServer.listen(port, () => {
    console.log(`TEST_7 running at http://localhost:${port}`);
});
