FROM php:8.2-apache

# Habilitar mod_rewrite para que funcionen los archivos .htaccess
RUN a2enmod rewrite

# Instalar la extension pdo_mysql necesaria para conectar a la base de datos
RUN docker-php-ext-install pdo_mysql

# Copiar el codigo del proyecto a la raiz de Apache
COPY . /var/www/html/

# Configurar permisos para Apache
RUN chown -R www-data:www-data /var/www/html/

# Exponer el puerto 80
EXPOSE 80
