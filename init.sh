#! /bin/sh

# root 계정으로 새로운 계정을 생성하고 그 계정으로 스크립트를 실행해주세요
# adduser <username>
# usermod -aG sudo <username>
# su - <username>

sudo apt-get update
sudo apt-get upgrade
sudo apt-get install nginx
sudo ufw allow 'Nginx Full'
sudo apt-get install mysql-server
curl -sL https://deb.nodesource.com/setup_18.x | sudo -E bash
sudo apt-get install -y nodejs
sudo npm install ghost-cli@latest -g
sudo mkdir -p /var/www/blog
sudo chown <username>:<username> /var/www/blog
sudo chmod 775 /var/www/blog
cd /var/www/blog
ghost install