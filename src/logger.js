const config = require('./config');
const fetch = require('node-fetch');

class Logger {

    // Log all incoming HTTP requests
    httpLogger = (req, res, next) => {
        let send = res.send;
        res.send = (resBody) => {
            const logData = {
                authorized: !!req.headers.authorization,
                path: req.originalUrl,
                method: req.method,
                statusCode: res.statusCode,
                reqBody: JSON.stringify(req.body),
                resBody: JSON.stringify(resBody)
            };
            const level = this.statusToLogLevel(res.statusCode);
            this.log(level, 'http', logData);
            res.send = send;
            return res.send(resBody);
        };
        next();
    }

    log(level, type, logData) {
      if (process.env.NODE_ENV === 'test') return; // fix tests?
      const labels = { component: config.logging.source, level: level, type: type };
      const values = [this.nowString(), this.sanitize(logData)];
      const logEvent = { streams: [{ stream: labels, values: [values] }] };

      this.sendLogToGrafana(logEvent);
    }

    statusToLogLevel(statusCode) {
        if (statusCode >= 500) return 'ERROR';
        if (statusCode >= 400) return 'WARN';
        return 'Info';
    }

    nowString() {
        return (Math.floor(Date.now()) * 1000000).toString();
    }

    // Things to sanitize: passwords, authTokens, 
    sanitize(logData) {
        logData = JSON.stringify(logData);

        // Normal data
        logData = this.replaceData(logData, "id");
        logData = this.replaceData(logData, "name");
        logData = this.replaceData(logData, "email");
        logData = this.replaceData(logData, "password");
        logData = this.replaceData(logData, "token");
        logData = this.replaceData(logData, "jwt");
        logData = this.replaceData(logData, "role");

        return logData;
    }

    replaceData(logData, fieldName) {
        if (fieldName === "id") {
            return logData.replace(/(\\)\1*"id(\\)\1*":\s*[0-9]*/g, '\\"id\\": ***')
        }
        const regex = new RegExp(`(\\\\)*["']${fieldName}(\\\\)*["']:\\s*(\\\\)*"[^"']*(\\\\)*["']`, 'g');
        return logData.replace(regex, `\\"${fieldName}\\": \\"*****\\"`);
    }

    sendLogToGrafana(event) {
        const body = JSON.stringify(event);
        fetch(`${config.logging.endpointUrl}`, {
            method: 'post',
            body: body,
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${config.logging.accountId}:${config.logging.apiKey}`,
            },
        }).then((res) => {
            if (!res.ok) console.log('Failed to send log to Grafana');
        });
    }

}

module.exports = new Logger();