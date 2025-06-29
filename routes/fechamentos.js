const express = require('express');
const router = express.Router();
//const { AtosPagos } = require('../models/AtosPagos'); // ajuste o caminho conforme seu projeto

// Exemplo de middleware de autenticação (ajuste conforme seu projeto)
const autenticar = (req, res, next) => {
  // Aqui você deve validar o token e preencher req.user com o nome do usuário
  // Exemplo fictício:
  req.user = { nome: 'NOME_DO_USUARIO_AUTENTICADO' };
  next();
};

router.get('/meus-fechamentos', autenticar, async (req, res) => {
  try {
    const usuario = req.user?.nome;
    if (!usuario) return res.status(401).json({ erro: 'Usuário não autenticado' });

    // Busca todos os atos pagos do usuário
    const fechamentos = await AtosPagos.findAll({
      where: { usuario },
      order: [['data', 'DESC'], ['hora', 'DESC']]
    });

    res.json({ fechamentos });
  } catch (err) {
    res.status(500).json({ erro: 'Erro ao buscar fechamentos' });
  }
});

module.exports = router;