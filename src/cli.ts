import instance from './plug';

if (process.argv.length > 2)
    instance.build({main: process.argv.slice(2)});
else
    console.log('usage: kremlin <entry-points>');