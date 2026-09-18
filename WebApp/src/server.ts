import * as express from 'express';
import * as path from 'path';
import * as fs from 'fs';
import * as morgan from 'morgan';
import signaling from './signaling';
import { log, LogLevel } from './log';
import Options from './class/options';
import { reset as resetHandler }from './class/httphandler';

const cors = require('cors');

// Rejects only a request that *presents* a wrong token (a request with none, e.g. every real
// listener, is always let through here); httphandler.ts's postOffer/postAnswer separately check
// whether a given offer/answer actually declares its sender a media source (sdpDeclaresSend) and
// require a *correct* token specifically for that - see the comment there for why message type
// alone (offer vs answer) can't be used to tell "listener" from "streamer".
const rejectWrongToken = (authtoken: string) => (req: express.Request, res: express.Response, next: express.NextFunction): void => {
  if (!authtoken) {
    next();
    return;
  }
  const header = req.header('Authorization');
  if (header !== undefined && header !== `Bearer ${authtoken}`) {
    res.sendStatus(401);
    return;
  }
  next();
};

export const createServer = (config: Options): express.Application => {
  const app: express.Application = express();
  resetHandler(config.mode, config.authtoken);
  // logging http access
  if (config.logging != "none") {
    app.use(morgan(config.logging));
  }
  // const signal = require('./signaling');
  app.use(cors({origin: '*'}));
  app.use(express.urlencoded({ extended: true }));
  app.use(express.json());
  app.get('/config', (req, res) => res.json({ useWebSocket: config.type == 'websocket', startupMode: config.mode, logging: config.logging }));
  app.use('/signaling', rejectWrongToken(config.authtoken), signaling);
  app.use(express.static(path.join(__dirname, '../client/public')));
  app.use('/module', express.static(path.join(__dirname, '../client/src')));
  app.get('/', (req, res) => {
    const indexPagePath: string = path.join(__dirname, '../client/public/index.html');
    fs.access(indexPagePath, (err) => {
      if (err) {
        log(LogLevel.warn, `Can't find file ' ${indexPagePath}`);
        res.status(404).send(`Can't find file ${indexPagePath}`);
      } else {
        res.sendFile(indexPagePath);
      }
    });
  });
  return app;
};
