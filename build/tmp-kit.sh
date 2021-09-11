set -e

export KIT=~/.kittmp
export KENV=~/.kenvtmp
echo $KIT

read -p "Remove $KIT? " -n 1 -r
echo    # (optional) move to a new line
if [[ -d $KIT && $REPLY =~ ^[Yy]$ ]]
then
    # do dangerous stuff
    echo "Removing $KIT ..."
    rm -rf "$KIT"
fi

read -p "Remove $KENV? " -n 1 -r
echo    # (optional) move to a new line
if [[ -d $KENV && $REPLY =~ ^[Yy]$ ]]
then
    # do dangerous stuff
    echo "Removing $KENV ..."
    rm -rf "$KENV"
fi

./build/local-assets.sh

