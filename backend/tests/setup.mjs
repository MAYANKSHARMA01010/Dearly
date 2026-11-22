// Synthetic public destination for fake-transport tests; never loads private .env.
import process from 'node:process';
process.env.APP_DOWNLOAD_URL = 'https://downloads.example.com/dearly/releases';
