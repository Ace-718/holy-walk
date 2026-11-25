FROM nginx:1.29-alpine
COPY default.conf /etc/nginx/conf.d/default.conf
COPY index.html /usr/share/nginx/html/index.html
COPY kjv /usr/share/nginx/html/kjv
COPY assets /usr/share/nginx/html/assets
COPY manifest.webmanifest /usr/share/nginx/html/manifest.webmanifest
EXPOSE 80
