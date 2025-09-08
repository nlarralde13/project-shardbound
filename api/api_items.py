from flask import Blueprint, request, jsonify
from sqlalchemy.exc import IntegrityError

from .models import db, Item, Character
from .models.inventory_v2 import CharacterItem

api = Blueprint('api', __name__, url_prefix='/api')

@api.route('/items', methods=['POST'])
def create_item():
    data = request.get_json(force=True, silent=True) or {}
    required = ['item_id', 'item_version', 'name', 'type', 'rarity', 'stack_size', 'base_stats']
    missing = [k for k in required if k not in data]
    if missing:
        return jsonify(error=f"Missing fields: {', '.join(missing)}"), 400

    item = db.session.get(Item, data['item_id'])
    if not item:
        item = Item(
            item_id=data['item_id'],
            item_version=data['item_version'],
            name=data['name'],
            type=data['type'],
            rarity=data['rarity'],
            stack_size=int(data.get('stack_size', 1)),
            base_stats=data.get('base_stats') or {},
        )
        db.session.add(item)
    else:
        item.item_version = data['item_version']
        item.name        = data['name']
        item.type        = data['type']
        item.rarity      = data['rarity']
        item.stack_size  = int(data.get('stack_size', item.stack_size))
        if data.get('base_stats') is not None:
            item.base_stats  = data.get('base_stats')

    try:
        db.session.commit()
    except IntegrityError as e:
        db.session.rollback()
        return jsonify(error='Integrity error', detail=str(e)), 400

    return jsonify(message='item created/updated', item_id=item.item_id), 201


@api.route('/item_instances', methods=['POST'])
def create_item_instance():
    return jsonify(error='v1_removed'), 410


@api.route('/game/characters/<character_id>/inventory', methods=['POST'])
def grant_inventory(character_id):
    data = request.get_json(force=True, silent=True) or {}
    item_id = data.get('item_id')
    quantity = int(data.get('quantity', 1))
    slot = data.get('slot')
    if not item_id:
        return jsonify(error='item_id required'), 400
    char = db.session.get(Character, character_id)
    if not char:
        return jsonify(error='Character not found'), 404
    row = CharacterItem(character_id=character_id, item_id=item_id, quantity=quantity, slot=slot)
    db.session.add(row)
    try:
        db.session.commit()
    except IntegrityError as e:
        db.session.rollback()
        return jsonify(error='Integrity error', detail=str(e)), 400
    return jsonify(message='granted', id=row.id), 201
