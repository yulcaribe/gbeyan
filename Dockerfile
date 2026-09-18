FROM php:8.3-apache

RUN apt-get update && apt-get install -y --no-install-recommends libcurl4-openssl-dev libonig-dev libxml2-dev && docker-php-ext-install curl mbstring dom && a2enmod rewrite headers && rm -rf /var/lib/apt/lists/*

WORKDIR /var/www/html
COPY . /var/www/html

RUN printf '<Directory /var/www/html>\nOptions -Indexes +FollowSymLinks\nAllowOverride All\nRequire all granted\n</Directory>\n' > /etc/apache2/conf-available/gbeyan.conf && a2enconf gbeyan && mkdir -p /var/www/html/api-php/storage && chown -R www-data:www-data /var/www/html/api-php/storage

ENV PORT=10000
EXPOSE 10000

CMD ["sh", "-c", "if [ -f /etc/secrets/config.local.php ]; then cp /etc/secrets/config.local.php /var/www/html/api-php/config.local.php && chown www-data:www-data /var/www/html/api-php/config.local.php && chmod 600 /var/www/html/api-php/config.local.php; fi; sed -ri \"s/^Listen 80$/Listen ${PORT}/\" /etc/apache2/ports.conf; sed -ri \"s/<VirtualHost \\*:80>/<VirtualHost *:${PORT}>/\" /etc/apache2/sites-available/000-default.conf; exec apache2-foreground"]
