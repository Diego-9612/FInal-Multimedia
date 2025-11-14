const Block = require('../models/Block')

exports.getBlocks = async (req, res) => {
    try {
        const level = parseInt(req.query.level) || 1;

        const blocks = await Block.find({ level: level }).select('name x y z level role -_id');

        res.json(blocks);
    } catch (error) {
        res.status(500).json({ message: 'Error al obtener bloques', error });
    }
};

// Agregar un nuevo bloque
exports.addBlock = async (req, res) => {
    try {
        const { name, x, y, z, level, role } = req.body; // 👈 usamos role (no rol)
        const newBlock = new Block({ name, x, y, z, level, role }); // 👈 coincide con el schema
        await newBlock.save();

        res.status(201).json({ message: 'Bloque guardado', block: newBlock });
    } catch (error) {
        res.status(500).json({ message: 'Error al guardar bloque', error });
    }
};

// Cargar lote desde JSON (para inicialización desde Blender)
exports.addMultipleBlocks = async (req, res) => {
    try {
        const blocks = req.body; // array [{ name, x, y, z, level, role }, ...]
        await Block.insertMany(blocks);
        res.status(201).json({ message: 'Bloques guardados', count: blocks.length });
    } catch (error) {
        res.status(500).json({ message: 'Error al guardar lote de bloques', error });
    }
};
