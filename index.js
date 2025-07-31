require('dotenv').config();

const { Client, GatewayIntentBits } = require('discord.js');
const { DisTube } = require('distube');
const { YtDlpPlugin } = require('@distube/yt-dlp');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

const distube = new DisTube(client, {
  plugins: [new YtDlpPlugin()],
  emitNewSongOnly: true,  // Para evitar eventos repetidos innecesarios
});

client.once('ready', () => {
  console.log(`✅ Bot listo como ${client.user.tag}`);
});

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;

  if (message.content.startsWith('!play')) {
    const args = message.content.split(' ');
    args.shift();
    let query = args.join(' ').trim();

    if (!query) {
      console.log('❌ No se proporcionó canción o URL');
      return message.reply('❌ Por favor proporciona una canción o URL.');
    }

    // Limpieza del parámetro start_radio=1 de la URL, si está presente
    if (query.includes('start_radio=1')) {
      console.log('⚙️ Detectado parámetro start_radio=1, limpiando URL...');
      try {
        const url = new URL(query);
        url.searchParams.delete('start_radio');
        query = url.toString();
        console.log(`URL limpia: ${query}`);
      } catch (e) {
        console.log('❌ URL inválida, no se pudo limpiar');
        return message.reply('❌ URL inválida o no soportada.');
      }
    }

    // Eliminar parámetros problemáticos específicos de listas que puedan causar problemas:
    // Por ejemplo, parámetros "list=RD..." o similares que a veces causan conflictos.
    try {
      const url = new URL(query);
      if (url.searchParams.has('list')) {
        console.log(`⚙️ Detectado parámetro list=${url.searchParams.get('list')}, limpiando para evitar conflictos...`);
        url.searchParams.delete('list');
        // También elimina index porque puede causar problemas con ciertas listas
        if (url.searchParams.has('index')) {
          url.searchParams.delete('index');
        }
        query = url.toString();
        console.log(`URL después de limpieza de lista: ${query}`);
      }
    } catch {
      // Si no es URL, no hacer nada
    }

    const voiceChannel = message.member.voice.channel;
    if (!voiceChannel) {
      console.log('❌ Usuario no está en un canal de voz');
      return message.reply('❌ Debes estar en un canal de voz para reproducir música.');
    }

    await message.reply('⏳ Cargando la canción...');

    console.log(`▶️ Intentando reproducir: ${query} en canal: ${voiceChannel.name}`);

    try {
      // Aquí quitamos el timeout para ver si distube play falla o queda colgado
      await distube.play(voiceChannel, query, {
        textChannel: message.channel,
        member: message.member,
      });
      console.log('✅ distube.play() llamado correctamente');
    } catch (e) {
      console.error('❌ Error al reproducir la canción:', e);
      if (e.message) {
        if (e.message.includes('Timeout')) {
          message.reply('❌ El enlace tarda demasiado en cargar o no es compatible.');
        } else if (e.message.includes('No video id found') || e.message.includes('Unsupported URL')) {
          message.reply('❌ URL no válida o no soportada por YouTube.');
        } else {
          message.reply('❌ Error al reproducir la canción: ' + e.message);
        }
      } else {
        message.reply('❌ Error al reproducir la canción, revisa los logs.');
      }
    }
  }

if (message.content === '!skip') {
  const queue = distube.getQueue(message.guildId);
  if (!queue) {
    console.log('❌ No hay canción para saltar');
    return message.reply('❌ No hay ninguna canción en reproducción.');
  }

  try {
    await queue.skip();  // <-- AÑADE AWAIT aquí
    console.log(`⏭️ Canción saltada por ${message.author.tag}`);
    message.channel.send(`⏭️ Canción saltada por ${message.author}`);
  } catch (e) {
    if (e.errorCode === 'NO_UP_NEXT') {
      console.log('⚠️ Intento de saltar pero no hay canción siguiente');
      message.reply('⚠️ No hay ninguna canción siguiente para saltar.');
    } else {
      console.error('❌ Error al intentar saltar la canción:', e.message || e);
      message.reply('❌ No se pudo saltar la canción.');
    }
  }
}
if (message.content === '!stop') {
  const queue = distube.getQueue(message.guildId);
  if (!queue) {
    console.log('❌ No hay canción en reproducción para detener');
    return message.reply('❌ No hay ninguna canción en reproducción.');
  }

  try {
    queue.stop();  // Detiene la reproducción y limpia la cola
    console.log(`⏹️ Reproducción detenida por ${message.author.tag}`);
    message.channel.send(`⏹️ Música detenida y cola limpia por ${message.author}`);
  } catch (e) {
    console.error('❌ Error al intentar detener la música:', e.message || e);
    message.reply('❌ No se pudo detener la música.');
  }
}


});

distube
  .on('playSong', (queue, song) => {
    console.log(`▶️ Evento playSong: Reproduciendo ${song.name}`);
    queue.textChannel.send(`▶️ Reproduciendo: \`${song.name}\``);
  })
  .on('playList', (queue, playlist, song) => {
    console.log(`▶️ Evento playList: Reproduciendo lista ${playlist.name} con ${playlist.songs.length} canciones`);
    if (song) {
      console.log(`   Con la canción: ${song.name}`);
    }
    queue.textChannel.send(`▶️ Reproduciendo lista: \`${playlist.name}\` con ${playlist.songs.length} canciones`);
  })
  .on('addSong', (queue, song) => {
    console.log(`➕ Evento addSong: Añadida a la cola ${song.name}`);
    queue.textChannel.send(`➕ Añadida a la cola: \`${song.name}\``);
  })
  .on('searchDone', (_, results) => {
    console.log(`🔍 searchDone: Encontré ${results.length} resultados`);
  })
  .on('searchNoResult', (_, query) => {
    console.log(`❌ searchNoResult: No se encontraron resultados para: ${query}`);
  })
  .on('error', (error, queue) => {
    console.error('❌ Error Distube:', error.message || error);
    if (queue && queue.textChannel) {
      queue.textChannel.send('❌ Error al reproducir: ' + (error.message || error));
    }
  })
  .on('empty', (queue) => {
    console.log('👋 Canal de voz vacío, desconectando...');
    queue.textChannel.send('👋 No quedan usuarios en el canal, desconectando...');
  })
  .on('finish', (queue) => {
    console.log('✅ Cola de reproducción terminada');
    queue.textChannel.send('✅ Reproducción terminada.');
  });

client.login(process.env.DISCORD_TOKEN);
