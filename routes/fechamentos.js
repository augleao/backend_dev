const express = require('express');
const router = express.Router();
const pool = require('../db');
const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || 'uma_chave_super_secreta';

// Middleware de autenticação
const autenticar = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ erro: 'Token não fornecido' });

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded; // O payload do token deve conter o nome do usuário
    next();
  } catch (err) {
    return res.status(401).json({ erro: 'Token inválido' });
  }
};

router.get('/meus-fechamentos', autenticar, async (req, res) => {
  try {
    const usuario = req.user?.nome;
    const usuarios = req.query.usuarios; // Ex: "Ana,Beto,Carlos"
    console.log('--- [meus-fechamentos] INICIO ---');
    console.log('Usuário autenticado:', usuario);
    console.log('Query usuarios:', usuarios);

    if (!usuario) {
      console.log('Usuário não autenticado!');
      return res.status(401).json({ erro: 'Usuário não autenticado' });
    }

    let whereClause = '';
    let params = [];
    if (usuarios) {
      const listaUsuarios = usuarios.split(',').map(u => u.trim());
      console.log('Lista de usuários recebida:', listaUsuarios);
      whereClause = `usuario = ANY($1) AND codigo IN ('0001', '0005')`;
      params = [listaUsuarios];
    } else {
      whereClause = `usuario = $1 AND codigo IN ('0001', '0005')`;
      params = [usuario];
    }

    const query = `
      SELECT
        data,
        hora,
        codigo,
        descricao,
        quantidade AS total_quantidade,
        valor_unitario AS total_valor,
        usuario
      FROM
        public.atos_pagos
      WHERE
        ${whereClause}
      ORDER BY
        data DESC, hora DESC;
    `;
    console.log('Query executada:', query);
    console.log('Parâmetros:', params);

    const result = await pool.query(query, params);
    console.log('Fechamentos encontrados:', result.rows);

    res.json({ fechamentos: result.rows });
    console.log('--- [meus-fechamentos] FIM ---');
  } catch (err) {
    console.error('Erro ao buscar fechamentos:', err);
    res.status(500).json({ erro: 'Erro ao buscar fechamentos' });
  }
});

module.exports = router;