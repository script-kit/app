export CURRENT=$PWD
export release_channel="${release_channel:="$(git rev-parse --abbrev-ref HEAD)"}"

echo "Release channel: $release_channel"

echo "Installing @johnlindquist/kit@$release_channel"
npm i "@johnlindquist/kit@$release_channel"

cd ./node_modules/@johnlindquist/kit
zip -r "$CURRENT/assets/kit.zip" ./ -x "./node_modules/*"
cd "$CURRENT"

kenv_url="https://github.com/johnlindquist/kenv/archive/refs/heads/$release_channel.zip"
echo "Downloading $kenv_url"
curl -L $kenv_url  -o ./assets/kenv.zip
