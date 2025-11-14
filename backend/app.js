require('dotenv').config()
const express = require('express')
const mongoose = require('mongoose')
const cors = require('cors')

const blockRoutes = require('./routes/blockRoutes')
const authRoutes = require('./routes/authRoutes')        // 👈 NUEVO
const profileRoutes = require('./routes/profileRoutes')  // 👈 NUEVO

const app = express()
const port = process.env.PORT || 3001

app.use(cors())
app.use(express.json())

app.get('/', (req, res) => {
    res.send(`
        <h1>API de bloques</h1>
        <p>Usa la ruta /blocks para interactuar con los bloques.</p>
        <p>Ejemplo de uso en el puerto ${port}:</p>
        `)
});

// Rutas REST
app.use('/api/blocks', blockRoutes)
app.use('/api/auth', authRoutes)        // 👈 NUEVO
app.use('/api/profile', profileRoutes)  // 👈 NUEVO

mongoose.connect(process.env.MONGO_URI)
    .then(() => {
        console.log('✅ Conectado a MongoDB')
    })
    .catch(err => console.error('Error al conectar a MongoDB:', err))

/**
 * Implementacion experiencia multijugador
 */

const http = require('http');
const socketio = require('socket.io');

const server = http.createServer(app); // usamos el mismo `app` existente
const io = socketio(server, {
    cors: {
        origin: '*'
    }
});

// ... (todo tu código de sockets tal como está)

// Escucha en el puerto como siempre
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
    console.log(`✅ Servidor corriendo en puerto ${PORT}`);
});
