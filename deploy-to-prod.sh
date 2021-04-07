tar -cf ../release.tar --exclude='./.env' --exclude='./.env.prod' --exclude='./DB' .
scp ../release.tar sinc@sinc.windel.com.br:~/release.tar
ssh sinc@sinc.windel.com.br 'tar -xf ~/release.tar -C ~/sinc_api'
ssh sinc@sinc.windel.com.br 'pm2 restart index'
rm -f ../release.tar
